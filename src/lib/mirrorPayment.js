import { supa } from './supabase';

/**
 * Mirrors a fabric vendor payment to the expense_mirror table
 * @param {Object} payment - Payment object with id, payment_date, amount, gst_amount, payment_mode, reference_number
 * @param {string} vendorName - Name of the vendor
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function mirrorVendorPayment(payment, vendorName) {
  try {
    // Check if mirror entry already exists
    const { data: existing } = await supa
      .from('expense_mirror')
      .select('id')
      .eq('source_type', 'fabric')
      .eq('source_id', payment.id)
      .single();

    const mirrorData = {
      source_type: 'fabric',
      source_id: payment.id,
      date: payment.payment_date,
      payee: vendorName,
      amount: payment.amount,
      gst_amount: payment.gst_amount || 0,
      payment_mode: payment.payment_mode,
      reference: payment.reference_number,
      status: 'paid',
    };

    let result;
    if (existing) {
      // Update existing
      result = await supa
        .from('expense_mirror')
        .update(mirrorData)
        .eq('source_type', 'fabric')
        .eq('source_id', payment.id)
        .select();
    } else {
      // Insert new
      result = await supa
        .from('expense_mirror')
        .insert([mirrorData])
        .select();
    }

    if (result.error) {
      console.error('Error mirroring vendor payment:', result.error);
      return { ok: false, error: result.error.message };
    }

    return { ok: true };
  } catch (error) {
    console.error('Error in mirrorVendorPayment:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Mirrors an outsource vendor payment to the expense_mirror table
 * @param {Object} payment - Payment object with id, date, amount, gst_amount, method, reference
 * @param {string} vendorName - Name of the vendor
 * @param {string} vendorType - Type of outsource work (e.g., 'Stitching', 'Embroidery', 'Dyeing')
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function mirrorOutsourcePayment(payment, vendorName, vendorType) {
  try {
    // Check if mirror entry already exists
    const { data: existing } = await supa
      .from('expense_mirror')
      .select('id')
      .eq('source_type', 'outsource')
      .eq('source_id', payment.id)
      .single();

    const mirrorData = {
      source_type: 'outsource',
      source_id: payment.id,
      date: payment.date,
      payee: vendorName,
      notes: vendorType,
      amount: payment.amount,
      gst_amount: payment.gst_amount || 0,
      payment_mode: payment.method,
      reference: payment.reference,
      status: 'paid',
    };

    let result;
    if (existing) {
      // Update existing
      result = await supa
        .from('expense_mirror')
        .update(mirrorData)
        .eq('source_type', 'outsource')
        .eq('source_id', payment.id)
        .select();
    } else {
      // Insert new
      result = await supa
        .from('expense_mirror')
        .insert([mirrorData])
        .select();
    }

    if (result.error) {
      console.error('Error mirroring outsource payment:', result.error);
      return { ok: false, error: result.error.message };
    }

    return { ok: true };
  } catch (error) {
    console.error('Error in mirrorOutsourcePayment:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Mirrors a salary payment to the expense_mirror table
 * @param {Object} entry - Salary entry object with id, paid_date, net_salary, utr
 * @param {string} staffName - Name of the staff member
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function mirrorSalaryPayment(entry, staffName) {
  try {
    // Check if mirror entry already exists
    const { data: existing } = await supa
      .from('expense_mirror')
      .select('id')
      .eq('source_type', 'salary')
      .eq('source_id', entry.id)
      .single();

    const paidDate = entry.paid_date || new Date().toISOString().split('T')[0];

    const mirrorData = {
      source_type: 'salary',
      source_id: entry.id,
      date: paidDate,
      payee: staffName,
      amount: entry.net_salary,
      gst_amount: 0,
      payment_mode: 'Bank Transfer',
      reference: entry.utr || null,
      status: 'paid',
    };

    let result;
    if (existing) {
      // Update existing
      result = await supa
        .from('expense_mirror')
        .update(mirrorData)
        .eq('source_type', 'salary')
        .eq('source_id', entry.id)
        .select();
    } else {
      // Insert new
      result = await supa
        .from('expense_mirror')
        .insert([mirrorData])
        .select();
    }

    if (result.error) {
      console.error('Error mirroring salary payment:', result.error);
      return { ok: false, error: result.error.message };
    }

    return { ok: true };
  } catch (error) {
    console.error('Error in mirrorSalaryPayment:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Mirrors a loan EMI payment to the expense_mirror table
 * @param {Object} loan - Loan object with id, lender_name
 * @param {string} paymentDate - Date of payment (ISO string or YYYY-MM-DD)
 * @param {number} amount - EMI amount
 * @param {string} reference - Payment reference (UTR, cheque number, etc.)
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function mirrorLoanEMI(loan, paymentDate, amount, reference) {
  try {
    // For loan EMI, we'll use a composite ID approach since one loan can have multiple EMIs
    // We'll create a unique source_id combining loan.id and paymentDate
    const sourceId = `${loan.id}-${paymentDate}`;

    // Check if mirror entry already exists
    const { data: existing } = await supa
      .from('expense_mirror')
      .select('id')
      .eq('source_type', 'emi')
      .eq('source_id', sourceId)
      .single();

    const mirrorData = {
      source_type: 'emi',
      source_id: sourceId,
      date: paymentDate,
      payee: loan.lender_name,
      amount: amount,
      gst_amount: 0,
      payment_mode: 'Bank Transfer',
      reference: reference,
      status: 'paid',
    };

    let result;
    if (existing) {
      // Update existing
      result = await supa
        .from('expense_mirror')
        .update(mirrorData)
        .eq('source_type', 'emi')
        .eq('source_id', sourceId)
        .select();
    } else {
      // Insert new
      result = await supa
        .from('expense_mirror')
        .insert([mirrorData])
        .select();
    }

    if (result.error) {
      console.error('Error mirroring loan EMI:', result.error);
      return { ok: false, error: result.error.message };
    }

    return { ok: true };
  } catch (error) {
    console.error('Error in mirrorLoanEMI:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Mirrors a general expense entry to the expense_mirror table
 * @param {Object} expense - Expense object with id, date, vendor_name, amount, gst_amount, payment_mode, reference
 * @param {string} accountName - Account/category name for this expense
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function mirrorExpenseEntry(expense, accountName) {
  try {
    // Check if mirror entry already exists
    const { data: existing } = await supa
      .from('expense_mirror')
      .select('id')
      .eq('source_type', 'expense')
      .eq('source_id', expense.id)
      .single();

    const mirrorData = {
      source_type: 'expense',
      source_id: expense.id,
      date: expense.date,
      payee: expense.vendor_name || 'General',
      notes: accountName,
      amount: expense.amount,
      gst_amount: expense.gst_amount || 0,
      payment_mode: expense.payment_mode,
      reference: expense.reference,
      status: 'paid',
    };

    let result;
    if (existing) {
      // Update existing
      result = await supa
        .from('expense_mirror')
        .update(mirrorData)
        .eq('source_type', 'expense')
        .eq('source_id', expense.id)
        .select();
    } else {
      // Insert new
      result = await supa
        .from('expense_mirror')
        .insert([mirrorData])
        .select();
    }

    if (result.error) {
      console.error('Error mirroring expense entry:', result.error);
      return { ok: false, error: result.error.message };
    }

    return { ok: true };
  } catch (error) {
    console.error('Error in mirrorExpenseEntry:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Removes a mirror entry when a payment is deleted or reversed
 * @param {string} sourceType - Source type (e.g., 'fabric', 'salary', 'outsource', 'emi', 'expense')
 * @param {string} sourceId - ID from the source table
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function removeMirror(sourceType, sourceId) {
  try {
    const result = await supa
      .from('expense_mirror')
      .delete()
      .eq('source_type', sourceType)
      .eq('source_id', sourceId);

    if (result.error) {
      console.error('Error removing mirror entry:', result.error);
      return { ok: false, error: result.error.message };
    }

    return { ok: true };
  } catch (error) {
    console.error('Error in removeMirror:', error);
    return { ok: false, error: error.message };
  }
}
