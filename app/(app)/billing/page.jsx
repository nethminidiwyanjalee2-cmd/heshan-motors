'use client';
import { useMemo, useRef, useState } from 'react';
import { useItems } from '@/lib/data';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/ui';
import { money, fmtDateTime, isOilCategory } from '@/lib/helpers';
import { createSale } from '@/lib/actions';
import Modal from '@/components/Modal';

export default function BillingPage() {
  const { items } = useItems();
  const { user } = useAuth();
  const toast = useToast();
  const scanRef = useRef(null);

  const [category, setCategory] = useState('All');
  const [unitType, setUnitType] = useState('Liters');
  const [capacity, setCapacity] = useState('1L');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState('');
  const [payment, setPayment] = useState('Cash');
  const [discount, setDiscount] = useState('0');
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);

  const isOilMode = category === 'Oil' || category === 'Lubricants';

  const matches = useMemo(() => {
    const v = q.trim().toLowerCase();
    let pool = items || [];
    if (category !== 'All') {
      pool = pool.filter((i) => {
        if (category === 'Oil' || category === 'Lubricants') {
          return isOilCategory(i.category, i.name);
        }
        return (i.category || 'Spare Parts').toLowerCase() === category.toLowerCase();
      });
    }
    if (!v) {
      return category !== 'All' ? pool.slice(0, 8) : [];
    }
    return pool.filter((i) => i.name.toLowerCase().includes(v) || (i.barcode || '').toLowerCase().includes(v)).slice(0, 8);
  }, [q, items, category]);

  const subtotal = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
  const disc = Math.max(0, parseFloat(discount) || 0);
  const total = Math.max(subtotal - disc, 0);

  function addToCart(item) {
    const isOil = isOilCategory(item.category, item.name);
    const itemUnit = isOil ? (item.unitType || (isOilMode ? unitType : 'Liters')) : '';
    const itemCapacity = isOil ? (item.capacity || (isOilMode ? capacity : '')) : '';

    const existing = cart.find((c) => c.categoryId === item.id);
    if (existing) {
      if (existing.quantity + 1 > item.stockQty) return toast(`Only ${item.stockQty} in stock for ${item.name}`, 'error');
      setCart(cart.map((c) => (c.categoryId === item.id ? { ...c, quantity: c.quantity + 1 } : c)));
    } else {
      if (item.stockQty < 1) return toast(`${item.name} is out of stock`, 'error');
      setCart([
        ...cart,
        {
          categoryId: item.id,
          name: item.name,
          category: item.category || (isOil ? 'Oil' : 'Spare Parts'),
          isOil,
          unitType: itemUnit,
          capacity: itemCapacity,
          unitPrice: item.price,
          quantity: 1,
          maxStock: item.stockQty,
        },
      ]);
    }
    setQ('');
    scanRef.current?.focus();
  }

  function onScanKey(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = e.currentTarget.value.trim();
    if (!v) return;
    const exact = items.find((i) => (i.barcode || '').toLowerCase() === v.toLowerCase());
    if (exact) addToCart(exact);
    else if (matches.length === 1) addToCart(matches[0]);
    else { toast(`No item found for "${v}"`, 'error'); setQ(''); }
  }

  function changeQty(id, delta) {
    const c = cart.find((x) => x.categoryId === id);
    if (!c) return;
    const n = c.quantity + delta;
    if (n <= 0) return setCart(cart.filter((x) => x.categoryId !== id));
    if (n > c.maxStock) return toast(`Only ${c.maxStock} in stock`, 'error');
    setCart(cart.map((x) => (x.categoryId === id ? { ...x, quantity: n } : x)));
  }

  async function checkout() {
    if (!cart.length) return toast('Cart is empty', 'error');
    setBusy(true);
    try {
      const sale = await createSale(items, cart, {
        discount: disc, paymentMethod: payment, customerName: customer.trim(), createdBy: user?.email,
      });
      setReceipt(sale);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function newBill() {
    setCart([]); setDiscount('0'); setCustomer(''); setReceipt(null); setQ('');
    setTimeout(() => scanRef.current?.focus(), 0);
  }

  return (
    <>
      <h1 className="page-title">New Bill</h1>
      <p className="page-sub">Scan a barcode or search by name to add items to the cart</p>

      <div className="billing-layout">
        <div className="card">
          <div className="grid-2" style={{ marginBottom: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Category</label>
              <select
                value={category}
                onChange={(e) => {
                  const val = e.target.value;
                  setCategory(val);
                  if (val === 'Oil' || val === 'Lubricants') {
                    if (!unitType) setUnitType('Liters');
                    if (!capacity) setCapacity('1L');
                  }
                }}
              >
                <option value="All">All Categories</option>
                <option value="Spare Parts">Spare Parts</option>
                <option value="Oil">Oil</option>
                <option value="Lubricants">Lubricants</option>
                <option value="Accessories">Accessories</option>
                <option value="Electrical">Electrical</option>
                <option value="Tires & Tubes">Tires & Tubes</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label>Scan Barcode or Search Item</label>
              <input
                ref={scanRef}
                type="text"
                className="scan-box"
                autoFocus
                placeholder="Scan here, or type item name..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onScanKey}
              />
            </div>
          </div>

          {/* Unit Type & Capacity per Unit appear ONLY when Category is Oil or Lubricants */}
          {isOilMode && (
            <div
              className="grid-2"
              style={{
                background: '#f8faf9',
                padding: '12px 14px',
                borderRadius: 8,
                border: '1px solid #dbe7df',
                marginBottom: 14,
              }}
            >
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Unit Type</label>
                <select
                  value={unitType}
                  onChange={(e) => setUnitType(e.target.value)}
                >
                  <option value="Liters">Liters</option>
                  <option value="Bottles">Bottles</option>
                  <option value="Ml">Ml</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Capacity per Unit</label>
                <input
                  type="text"
                  placeholder="e.g. 1L, 4L, 800ml"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                />
              </div>
            </div>
          )}

          {matches.length > 0 && (
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, marginTop: 4, marginBottom: 14 }}>
              {matches.map((m) => {
                const isOil = isOilCategory(m.category, m.name);
                const unitText = isOil ? ` ${m.unitType || 'Liters'}` : '';
                return (
                  <div
                    key={m.id}
                    style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line)' }}
                    onMouseDown={(e) => { e.preventDefault(); addToCart(m); }}
                  >
                    <strong>{m.name}</strong>{' '}
                    {isOil && m.capacity && (
                      <span style={{ fontSize: 11, background: '#eef3ef', color: 'var(--green)', padding: '1px 5px', borderRadius: 4, marginRight: 6 }}>
                        {m.capacity}
                      </span>
                    )}
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                      ({m.barcode}) · Stock: {m.stockQty}{unitText} · {money(m.price)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <h2 style={{ fontSize: 14, color: 'var(--muted)', margin: '18px 0 6px' }}>Cart</h2>
          {cart.map((c) => (
            <div className="cart-item" key={c.categoryId}>
              <div>
                <div className="cart-item-name">
                  {c.name}
                  {c.isOil && (
                    <span style={{ marginLeft: 6, fontSize: 11, background: '#eef3ef', color: 'var(--green)', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                      {c.unitType || 'Liters'}{c.capacity ? ` · ${c.capacity}` : ''}
                    </span>
                  )}
                </div>
                <div className="cart-item-sub">{money(c.unitPrice)} each</div>
              </div>
              <div className="qty-control">
                <button onClick={() => changeQty(c.categoryId, -1)}>-</button>
                <span style={{ minWidth: 44, textAlign: 'center', fontWeight: 600 }}>
                  {c.quantity} {c.isOil ? (c.unitType || 'L') : ''}
                </span>
                <button onClick={() => changeQty(c.categoryId, 1)}>+</button>
                <button
                  onClick={() => setCart(cart.filter((x) => x.categoryId !== c.categoryId))}
                  style={{ marginLeft: 8, color: '#c0392b', borderColor: '#f0c9c1' }}
                  title="Remove item"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {cart.length === 0 && <div className="empty-state">Cart is empty. Scan an item to begin.</div>}
        </div>

        <div className="card">
          <h2 style={{ fontSize: 15, marginTop: 0 }}>Bill Summary</h2>
          <div className="field"><label>Customer Name (optional)</label>
            <input type="text" placeholder="Walk-in customer" value={customer} onChange={(e) => setCustomer(e.target.value)} /></div>
          <div className="field"><label>Payment Method</label>
            <select value={payment} onChange={(e) => setPayment(e.target.value)}>
              <option>Cash</option><option>Card</option><option>Bank Transfer</option>
            </select></div>
          <div className="field"><label>Discount (Rs.)</label>
            <input type="number" step="0.01" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
          <div className="total-row"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          <div className="total-row"><span>Discount</span><span>{money(disc)}</span></div>
          <div className="total-row grand"><span>Total</span><span>{money(total)}</span></div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                  onClick={checkout} disabled={busy}>
            {busy ? 'Saving…' : 'Complete Sale'}
          </button>
        </div>
      </div>

      <Modal open={!!receipt} width={380}>
        {receipt && (
          <>
            <h2>Sale Completed ✓</h2>
            <div className="print-area" style={{ fontSize: 13 }}>
              <div className="receipt-logo-wrap" style={{ marginBottom: 8 }}>
                <img
                  src="/logo2.jpeg"
                  alt="Heshan Motors Logo"
                  className="receipt-logo"
                  style={{
                    display: 'block',
                    margin: '0 auto',
                    maxHeight: 65,
                    maxWidth: '65%',
                    objectFit: 'contain',
                    mixBlendMode: 'multiply',
                    background: 'transparent',
                    filter: 'none',
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
              <div style={{ borderTop: '1px dashed var(--line)', borderBottom: '1px dashed var(--line)', padding: '6px 0', margin: '6px 0', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span><strong>Invoice:</strong> {receipt.invoiceNo}</span>
                  <span><strong>Date:</strong> {fmtDateTime(receipt.createdAt)}</span>
                </div>
                {receipt.customerName && <div style={{ marginTop: 2 }}><strong>Customer:</strong> {receipt.customerName}</div>}
                <div style={{ marginTop: 2 }}><strong>Payment:</strong> {receipt.paymentMethod}</div>
              </div>
              <table style={{ margin: '8px 0', width: '100%' }}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.items.map((i, idx) => (
                    <tr key={idx}>
                      <td>
                        {i.name}
                        {i.unitType && (
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {i.unitType}{i.capacity ? ` (${i.capacity})` : ''}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {i.quantity} {i.unitType ? i.unitType : ''}
                      </td>
                      <td style={{ textAlign: 'right' }}>{money(i.unitPrice)}</td>
                      <td style={{ textAlign: 'right' }}>{money(i.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="total-row"><span>Subtotal</span><span>{money(receipt.subtotal)}</span></div>
              <div className="total-row"><span>Discount</span><span>{money(receipt.discount)}</span></div>
              <div className="total-row grand"><span>Total</span><span>{money(receipt.totalAmount)}</span></div>
              <div style={{ borderTop: '1px dashed var(--line)', marginTop: 10, paddingTop: 8, textAlign: 'center' }}>
                <div style={{ fontWeight: 'bold' }}>Thank you for choosing us. Have a great day!</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Balangoda, Sri Lanka</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Tel: 070 181 8180 / 077 355 1902</div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => window.print()}>Print</button>
              <button className="btn btn-primary" onClick={newBill}>New Bill</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
