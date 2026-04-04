import { supabaseAdmin } from '@/lib/supabase'
import { sendEmailAlert, sendSmsAlert } from '@/lib/alerts'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const { sku, quantity } = await request.json()

    if (!sku || !quantity || quantity < 1) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { data: item, error: fetchError } = await supabaseAdmin
      .from('inventory')
      .select('*')
      .eq('sku', sku)
      .single()

    if (fetchError || !item) {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 })
    }

    const newStock = Math.max(0, item.stock - quantity)

    const { error: updateError } = await supabaseAdmin
      .from('inventory')
      .update({ stock: newStock })
      .eq('sku', sku)

    if (updateError) throw updateError

    if (newStock <= item.threshold) {
      const alertItem = { ...item, stock: newStock }
      await Promise.all([
        sendEmailAlert([alertItem]),
        sendSmsAlert([alertItem]),
      ])
    }

    return NextResponse.json({
      sku,
      previous_stock: item.stock,
      new_stock: newStock,
      threshold: item.threshold,
      alert_sent: newStock <= item.threshold,
    })
  } catch (err) {
    console.error('Inventory update failed:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
