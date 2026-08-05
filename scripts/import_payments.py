#!/usr/bin/env python3
"""Import one month of Store Payments from the legacy Excel ledger.

Two-phase: first run with --dry-run to produce a CSV report at
outputs/import-<batch_id>-dryrun.csv. Sahith reviews. Then re-run with
--commit to insert into pos_payments and rebuild order totals.

Idempotent per --batch-id: a re-import deletes prior rows with the
same import_batch_id, then re-inserts.

Usage:
  python scripts/import_payments.py --month 2026-04 --batch-id apr-2026 --workbook 'uploads/HILO POS _ At Store .xlsx' --dry-run
  python scripts/import_payments.py --month 2026-04 --batch-id apr-2026 --commit
"""
import argparse, csv, datetime as dt, json, os, re, sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("Install openpyxl: pip install openpyxl", file=sys.stderr); sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("Install supabase-py: pip install supabase", file=sys.stderr); sys.exit(1)


# ── Method mapping ─────────────────────────────────────────────────
MODE_MAP = {
    'cash': 'cash',
    'hdfc terminal': 'hdfc_pos',
    'hdfc card':     'hdfc_pos',
    'hdfc pos':      'hdfc_pos',
    'hdfc qr':       'hdfc_qr',
    'bob qr':        'bob_qr',
    'bob pos qr':    'bob_qr',
    'bob pos card':  'bob_pos',
    'bob pos':       'bob_pos',
    'paytm terminal':'paytm_pos',
    'paytm pos':     'paytm_pos',
    'paytm link':    'paytm_link',
    'razorpay link': 'razorpay',
    'razorpay':      'razorpay',
    'bank transfer hdfc': ('bank_transfer', 'HDFC'),
    'bank transfer bob':  ('bank_transfer', 'BOB'),
    'bank transfer':      'bank_transfer',
    'gpay':         'gpay',
    'phone pay':    'phonepe',
    'phonepe':      'phonepe',
    'card':         'card',
    'qr':           'qr_other',
    'qr scane':     'qr_other',
}
SKIP_MODES = {'payment pending', 'order cancelled', '', 'ins link'}


def resolve_method(raw_mode):
    raw = (raw_mode or '').strip().lower()
    if raw in SKIP_MODES:
        return None
    # GPay-to-<person> → gpay_personal with name as reference
    m = re.match(r'^gpay (?:to )?(.+)$', raw)
    if m:
        return ('gpay_personal', m.group(1).strip().title())
    mapped = MODE_MAP.get(raw)
    if isinstance(mapped, tuple):
        return mapped
    if mapped:
        return (mapped, None)
    return ('unknown', raw)


# ── Stylist normalisation ─────────────────────────────────────────
def resolve_stylist(raw, team_members):
    """Return (display_name, team_id_or_None, flag_or_None)."""
    if not raw or not str(raw).strip():
        return ('Excel Import', None, None)
    name = str(raw).strip()
    # 1. Exact case-insensitive match
    for m in team_members:
        if m['name'].lower() == name.lower():
            return (m['name'], m['id'], None)
    # 2. First-name match
    first = name.split()[0].lower()
    for m in team_members:
        if m['name'].lower().startswith(first + ' '):
            return (m['name'], m['id'], None)
    # 3. Unmatched — flag as old employee
    return (f'Excel Import — {name}', None, 'unmatched_stylist')


def clean_phone(v):
    if v is None: return None
    s = re.sub(r'[^0-9+]', '', str(v))
    return s or None


# ── Main ──────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--month', required=True, help="YYYY-MM, e.g. 2026-04")
    ap.add_argument('--batch-id', required=True, help="e.g. apr-2026")
    ap.add_argument('--workbook', default='uploads/HILO POS _ At Store .xlsx')
    ap.add_argument('--sheet', default='Store Payments')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--commit', action='store_true')
    ap.add_argument('--outputs-dir', default='outputs')
    args = ap.parse_args()

    if not (args.dry_run or args.commit):
        ap.error("Provide --dry-run or --commit")
    if args.dry_run and args.commit:
        ap.error("--dry-run and --commit are mutually exclusive")

    year, month = map(int, args.month.split('-'))

    # Supabase client
    url = os.environ.get('SUPABASE_URL') or os.environ.get('VITE_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        print("ERROR: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars (service role required for inserts).", file=sys.stderr)
        sys.exit(1)
    sb = create_client(url, key)

    # Load reference data
    print(f"Loading team_members…")
    team = sb.table('team_members').select('id,name').execute().data or []
    print(f"  {len(team)} members")

    print(f"Loading shopify_orders (for matching)…")
    # We need every order_number that appears in the month to map → id + total_price + stylist.
    # Pull a comfortable window: orders created in the 6 months around our import month.
    win_from = (dt.date(year, month, 1) - dt.timedelta(days=120)).isoformat()
    win_to   = (dt.date(year, month, 1) + dt.timedelta(days=120)).isoformat()
    orders = sb.table('shopify_orders').select('id,order_number,total_price,stylist').gte('created_at', win_from).lte('created_at', win_to).execute().data or []
    order_lookup = { (o.get('order_number') or '').strip().upper(): o for o in orders }
    # Build a stylist→id index on the orders so we can fill collected_by_id
    team_by_name = { m['name'].lower(): m['id'] for m in team }
    print(f"  {len(orders)} candidate orders")

    # Open workbook
    print(f"Loading workbook {args.workbook}")
    wb = openpyxl.load_workbook(args.workbook, data_only=True)
    ws = wb[args.sheet]

    # Iterate. Excel sometimes merges cells when a single order has multiple
    # payments — the merged value lives only in the first row; subsequent rows
    # read as None. Forward-fill date / order_id / client / mobile / order_amt
    # from the most recent populated row so those "continuation" rows still
    # import correctly.
    payloads = []     # rows that will (or could) be inserted
    skipped  = []     # rows that won't be inserted; reason logged
    carry = {'date': None, 'order_id': None, 'client': None, 'mobile': None, 'order_amt': None}

    for r in range(2, ws.max_row + 1):
        row = [ws.cell(r, c).value for c in range(1, 14)]
        # Update carry from any populated fields
        if row[1] is not None: carry['date']      = row[1]
        if row[2] is not None: carry['order_id']  = row[2]
        if row[4] is not None: carry['client']    = row[4]
        if row[5] is not None: carry['mobile']    = row[5]
        if row[6] is not None: carry['order_amt'] = row[6]
        # Forward-fill missing fields
        date_val   = row[1] if row[1] is not None else carry['date']
        order_id_v = row[2] if row[2] is not None else carry['order_id']
        client_v   = row[4] if row[4] is not None else carry['client']
        mobile_v   = row[5] if row[5] is not None else carry['mobile']
        order_amt_v= row[6] if row[6] is not None else carry['order_amt']
        # Re-pack into row so the rest of the function reads filled values
        row = [row[0], date_val, order_id_v, row[3], client_v, mobile_v,
               order_amt_v, row[7], row[8], row[9], row[10], row[11], row[12]]
        if not isinstance(date_val, dt.datetime):
            continue
        if date_val.year != year or date_val.month != month:
            continue

        order_id_excel = (str(row[2]).strip() if row[2] else '')
        method_raw     = row[3]
        client_name    = row[4]
        mobile         = row[5]
        order_amt      = row[6]
        paid_amt       = row[8]
        payment_note   = row[9]
        stylist_raw    = row[10]
        verif_raw      = row[11]
        remarks        = row[12]

        row_ref = f"StorePayments!R{r}"

        # 1. Skip status rows
        if not method_raw or str(method_raw).strip().lower() in SKIP_MODES:
            skipped.append({'status':'skip_status_row','row_ref':row_ref,'order_id_excel':order_id_excel,'date':date_val.date().isoformat(),'method_excel':method_raw,'notes':'non-payment row'})
            continue

        method = resolve_method(method_raw)
        if method is None:
            skipped.append({'status':'skip_status_row','row_ref':row_ref,'order_id_excel':order_id_excel,'date':date_val.date().isoformat(),'method_excel':method_raw,'notes':'mapped to skip'})
            continue
        method_key, reference = method

        if method_key == 'unknown':
            skipped.append({'status':'skip_unknown_method','row_ref':row_ref,'order_id_excel':order_id_excel,'date':date_val.date().isoformat(),'method_excel':method_raw,'notes':f'no mapping for "{reference}"'})
            continue

        # 2. Amount
        amount = float(paid_amt or 0)
        if amount <= 0:
            skipped.append({'status':'skip_zero_amount','row_ref':row_ref,'order_id_excel':order_id_excel,'date':date_val.date().isoformat(),'method_excel':method_raw,'notes':'paid_amt is 0 or missing'})
            continue

        # 3. Order match (order_id is required for FK)
        order_id_norm = order_id_excel.strip().upper()
        order = order_lookup.get(order_id_norm)
        if not order:
            skipped.append({'status':'skip_unmatched_order','row_ref':row_ref,'order_id_excel':order_id_excel,'date':date_val.date().isoformat(),'method_excel':method_raw,'notes':'no shopify_orders row with this order_number'})
            continue

        # 4. Stylist resolve
        stylist_name, stylist_id, stylist_flag = resolve_stylist(stylist_raw, team)

        # 5. Mismatch detection
        flags = []
        hilo_total = float(order.get('total_price') or 0)
        if order_amt and abs(float(order_amt) - hilo_total) > 1.0:
            flags.append('amount_mismatch')
        if stylist_flag:
            flags.append(stylist_flag)
        mismatch_flag = flags[0] if flags else None

        # 6. Verification
        verified = (verif_raw or '').strip().lower() == 'verified'

        # 7. Notes
        notes_parts = []
        if payment_note: notes_parts.append(str(payment_note))
        if remarks:      notes_parts.append(str(remarks))
        if 'amount_mismatch' in flags:
            notes_parts.append(f"Mismatch: Excel ₹{order_amt}, Hilo ₹{hilo_total}")
        notes = ' · '.join(notes_parts) or None

        # 8. collected_by_id from the order's stylist (best-effort match)
        order_stylist = order.get('stylist') or ''
        collected_by_id = team_by_name.get(order_stylist.lower()) if order_stylist else None

        payload = {
            'order_id': order['id'],
            'method': method_key,
            'amount': amount,
            'reference': reference,
            'payment_type': 'initial',  # rewritten after we sort all batch rows
            'collected_at': date_val.isoformat(),
            'collected_by_name': order_stylist or None,
            'collected_by_id': collected_by_id,
            'created_by_name': stylist_name,
            'created_by_id': stylist_id,
            'verification_status': 'verified' if verified else 'unverified',
            'verified_at': date_val.isoformat() if verified else None,
            'verified_by_name': 'Excel Import' if verified else None,
            'source': 'excel_import',
            'import_batch_id': args.batch_id,
            'import_row_ref': row_ref,
            'customer_phone_raw': clean_phone(mobile),
            'customer_name_raw': str(client_name) if client_name else None,
            'mismatch_flag': mismatch_flag,
            'notes': notes,
        }
        status = 'flagged_' + flags[0] if flags else 'ready'
        payloads.append({
            'status': status, 'row_ref': row_ref, 'order_id_excel': order_id_excel,
            'order_id_hilo': order['id'], 'date': date_val.date().isoformat(),
            'method_excel': method_raw, 'method_resolved': method_key, 'reference': reference or '',
            'amount': amount, 'stylist_excel': stylist_raw or '', 'stylist_resolved': stylist_name,
            'customer': client_name or '', 'mismatch': mismatch_flag or '',
            'notes': notes or '', '_payload': payload,
        })

    # Sort by (order_id, collected_at) and rewrite payment_type
    payloads.sort(key=lambda r: (r['_payload']['order_id'], r['_payload']['collected_at']))
    seen_first_for_order = set()
    for row in payloads:
        oid = row['_payload']['order_id']
        # Check if this is the FIRST payment for this order ever (counting both
        # what we're inserting AND what's already in DB). For simplicity we
        # rely on existing pos_payments.payment_type being correct and only
        # rewrite within this batch.
        if oid in seen_first_for_order:
            row['_payload']['payment_type'] = 'due_collection'
        else:
            row['_payload']['payment_type'] = 'initial'
            seen_first_for_order.add(oid)

    # ── Dry-run report ─────────────────────────────────────────────
    outdir = Path(args.outputs_dir); outdir.mkdir(exist_ok=True)
    report_path = outdir / f"import-{args.batch_id}-dryrun.csv"
    fieldnames = ['status','row_ref','order_id_excel','order_id_hilo','date','method_excel','method_resolved','reference','amount','stylist_excel','stylist_resolved','customer','mismatch','notes']
    with open(report_path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for row in payloads + skipped:
            w.writerow({k: row.get(k, '') for k in fieldnames})

    n_ready = sum(1 for r in payloads if r['status'] == 'ready')
    n_flag  = sum(1 for r in payloads if r['status'].startswith('flagged_'))
    n_skip  = len(skipped)
    n_unkn  = sum(1 for r in skipped if r['status'] == 'skip_unknown_method')
    total_amt = sum(r['amount'] for r in payloads)

    print()
    print(f"── Dry-run report ─────────────────────────────────────")
    print(f"  Month:           {args.month}")
    print(f"  Batch ID:        {args.batch_id}")
    print(f"  Rows ready:      {n_ready}")
    print(f"  Rows flagged:    {n_flag} (will still import, with flag set)")
    print(f"  Rows skipped:    {n_skip}")
    print(f"      unknown method:  {n_unkn}")
    print(f"      unmatched order: {sum(1 for r in skipped if r['status']=='skip_unmatched_order')}")
    print(f"      zero amount:     {sum(1 for r in skipped if r['status']=='skip_zero_amount')}")
    print(f"      status rows:     {sum(1 for r in skipped if r['status']=='skip_status_row')}")
    print(f"  Total to import: ₹{total_amt:,.0f}")
    print(f"  Report written:  {report_path}")
    print()

    if n_unkn > 0:
        print(f"  ⚠ {n_unkn} unknown-method rows. Map them in MODE_MAP and re-run.", file=sys.stderr)

    if args.dry_run:
        print(f"Dry run only — no DB writes. Re-run with --commit to insert.")
        return

    # ── COMMIT ──────────────────────────────────────────────────────
    if n_unkn > 0:
        print(f"\nABORT: {n_unkn} unknown-method rows. Edit MODE_MAP and re-run dry-run, then commit.", file=sys.stderr)
        sys.exit(2)

    print(f"Committing {n_ready + n_flag} rows…")

    # Idempotent: delete any prior rows with this batch_id (so a re-run is safe)
    prior = sb.table('pos_payments').select('id,order_id').eq('import_batch_id', args.batch_id).execute().data or []
    if prior:
        print(f"  Found {len(prior)} prior rows for this batch_id — deleting before re-insert.")
        sb.table('pos_payments').delete().eq('import_batch_id', args.batch_id).execute()

    insert_rows = [r['_payload'] for r in payloads]
    chunk = 50
    inserted = 0
    for i in range(0, len(insert_rows), chunk):
        batch = insert_rows[i:i+chunk]
        sb.table('pos_payments').insert(batch).execute()
        inserted += len(batch)
        print(f"  Inserted {inserted}/{len(insert_rows)}…")

    touched_order_ids = sorted({r['_payload']['order_id'] for r in payloads})
    print(f"Rebuilding totals on {len(touched_order_ids)} orders…")
    sb.rpc('rebuild_order_totals_batch', {'p_order_ids': touched_order_ids}).execute()

    print(f"\n✓ Import complete: {inserted} rows, ₹{total_amt:,.0f}")
    print(f"  To revert: DELETE FROM pos_payments WHERE import_batch_id = '{args.batch_id}';")


if __name__ == '__main__':
    main()
