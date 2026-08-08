-- ═══════════════════════════════════════════════════════════════════
-- INVENTORY STOCK TRIGGER
-- Automatically updates inventory_stock.quantity_on_hand whenever a
-- row is inserted into inventory_movements.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Function that runs on each movement INSERT
CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Upsert into inventory_stock: create row if missing, else add delta
  INSERT INTO public.inventory_stock (sku_id, location_id, quantity_on_hand, quantity_reserved)
  VALUES (
    NEW.sku_id,
    NEW.location_id,
    GREATEST(0, NEW.qty_delta),
    0
  )
  ON CONFLICT (sku_id, location_id) DO UPDATE
    SET quantity_on_hand = GREATEST(0, inventory_stock.quantity_on_hand + NEW.qty_delta);

  RETURN NEW;
END;
$$;

-- 2. Attach trigger (drop first so re-runs are idempotent)
DROP TRIGGER IF EXISTS trg_apply_inventory_movement ON public.inventory_movements;

CREATE TRIGGER trg_apply_inventory_movement
AFTER INSERT ON public.inventory_movements
FOR EACH ROW
EXECUTE FUNCTION public.apply_inventory_movement();
