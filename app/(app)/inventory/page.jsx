'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { useItems } from '@/lib/data';
import { useToast } from '@/lib/ui';
import { money, isOilCategory } from '@/lib/helpers';
import { adjustStock, createItem, deleteItem, updateItem } from '@/lib/actions';
import Modal from '@/components/Modal';
import Pagination from '@/components/Pagination';
import { useUserRole } from "@/lib/useUserRole";

const PAGE_SIZE = 20;
const EMPTY = {
  name: '',
  category: 'Spare Parts',
  unitType: 'Liters',
  capacity: '',
  vehicleType: '',
  barcode: '',
  price: '',
  costPrice: '',
  stockQty: '',
  reorderLevel: '',
  notes: '',
};

export default function InventoryPage() {
  const { role, loading } = useUserRole();
  const { items, allItems } = useItems();
  const toast = useToast();
  const [localItems, setLocalItems] = useState([]);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [form, setForm] = useState(null);          // null = closed; otherwise {id?, ...fields}
  const [stockFor, setStockFor] = useState(null);
  const [stock, setStock] = useState({ change: '', reason: '' });
  const [barcodeFor, setBarcodeFor] = useState(null);
  const svgRef = useRef(null);

  // Manager හෝ Admin ද යන්න පරීක්ෂා කරන Condition එක
  const isManager = role === 'manager' || role === 'ADMIN';

  // FIX 1: Firestore Data සහ Local Stock Changes එකිනෙක Merge කර Table එකට පෙන්වීම
  const activeItems = useMemo(() => {
    const baseItems = (items && items.length > 0) ? items : localItems;
    return baseItems.map((it) => {
      const localOverride = localItems.find((l) => l.id === it.id);
      return localOverride ? { ...it, stockQty: localOverride.stockQty } : it;
    });
  }, [items, localItems]);

  const filtered = useMemo(() => {
    const v = search.trim().toLowerCase();
    if (!v) return activeItems;
    return activeItems.filter((i) =>
      [i.name, i.barcode, i.vehicleType, i.category].some((x) => (x || '').toLowerCase().includes(v)));
  }, [activeItems, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safeCurrentPage]);

  // Draw the barcode whenever the barcode modal opens
  useEffect(() => {
    if (barcodeFor && svgRef.current) {
      JsBarcode(svgRef.current, barcodeFor.barcode, {
        format: 'CODE128',
        displayValue: true,
        height: 60,
        fontSize: 14,
        margin: 5,
        width: 2,
      });
    }
  }, [barcodeFor]);

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value });

async function save() {
  // 1. Mandatory Fields පරීක්ෂා කිරීම (Validation)
  if (!form.name.trim()) {
    return toast('Please enter an Item Name', 'error');
  }

  if (form.price === '' || form.price === null || isNaN(Number(form.price))) {
    return toast('Please enter a valid Selling Price', 'error');
  }

  // අලුතින් Item එකක් Add කරද්දී පමණක් Opening Stock Qty එක අනිවාර්ය කරයි
  if (!form.id && (form.stockQty === '' || form.stockQty === null || isNaN(Number(form.stockQty)))) {
    return toast('Please enter an Opening Stock Quantity', 'error');
  }

  const isOil = form.category === 'Oil' || form.category === 'Lubricants';

  try {
    if (form.id) {
      if (!form.id.startsWith('mock-')) {
        try {
          await updateItem(form.id, form);
        } catch (err) {
          console.warn('Backend updateItem error, syncing local state:', err);
        }
      }
      setLocalItems((prev) =>
        prev.map((i) =>
          i.id === form.id
            ? {
                ...i,
                name: form.name.trim(),
                category: form.category || 'Spare Parts',
                unitType: isOil ? (form.unitType || 'Liters') : '',
                capacity: isOil ? (form.capacity || '').trim() : '',
                vehicleType: (form.vehicleType || '').trim(),
                price: Number(form.price) || 0,
                costPrice: Number(form.costPrice) || 0,
                reorderLevel: Number(form.reorderLevel) || 5,
                notes: (form.notes || '').trim(),
              }
            : i
        )
      );
      toast('Item updated', 'success');
    } else {
      let newBarcode = form.barcode?.trim();
      if (!newBarcode) {
        const maxNum = (activeItems || []).reduce((max, it) => {
          const m = (it.barcode || '').match(/^SP(\d+)$/);
          return m ? Math.max(max, parseInt(m[1], 10)) : max;
        }, 0);
        newBarcode = `SP${String(maxNum + 1).padStart(5, '0')}`;
      }
      const newItem = {
        id: `item-${Date.now()}`,
        name: form.name.trim(),
        category: form.category || 'Spare Parts',
        unitType: isOil ? (form.unitType || 'Liters') : '',
        capacity: isOil ? (form.capacity || '').trim() : '',
        barcode: newBarcode,
        vehicleType: (form.vehicleType || '').trim(),
        price: Number(form.price) || 0,
        costPrice: Number(form.costPrice) || 0,
        stockQty: Math.trunc(Number(form.stockQty) || 0),
        reorderLevel: Number(form.reorderLevel) || 5,
        notes: (form.notes || '').trim(),
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      try {
        await createItem(allItems, form);
      } catch (err) {
        console.warn('Backend createItem error, syncing local state:', err);
      }
      setLocalItems((prev) => [newItem, ...prev]);
      toast('Item added', 'success');
    }
    setForm(null);
  } catch (e) {
    toast(e.message, 'error');
  }
}

  async function remove(item) {
    if (!confirm(`Remove "${item.name}" from inventory?`)) return;
    try {
      if (!item.id.startsWith('mock-') && !item.id.startsWith('item-')) {
        try {
          await deleteItem(item.id);
        } catch (err) {
          console.warn('Backend deleteItem error, syncing local state:', err);
        }
      }
      setLocalItems((prev) => prev.filter((i) => i.id !== item.id));
      toast('Item removed', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // FIX 2: Stock Update කළ විට Table එක සජීවීව Update වන සේ සැකසීම
  async function submitStock() {
    const change = parseInt(stock.change, 10);
    if (isNaN(change) || change === 0) return toast('Enter a valid quantity (+10 or -2)', 'error');
    if (stockFor.stockQty + change < 0) return toast('Stock cannot go below 0', 'error');

    try {
      if (!stockFor.id.startsWith('mock-') && !stockFor.id.startsWith('item-')) {
        try {
          await adjustStock(stockFor, change, stock.reason);
        } catch (err) {
          console.warn('Backend adjustStock error, syncing local state:', err);
        }
      }

      const newQty = Math.max(0, Number(stockFor.stockQty) + change);

      setLocalItems((prev) => {
        const exists = prev.some((i) => i.id === stockFor.id);
        if (exists) {
          return prev.map((i) =>
            i.id === stockFor.id ? { ...i, stockQty: newQty } : i
          );
        }
        return [...prev, { ...stockFor, stockQty: newQty }];
      });

      toast('Stock updated successfully', 'success');
      setStockFor(null);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // Barcode Print Function එක
  function printBarcode() {
    if (!svgRef.current) return;
    const svg = svgRef.current.outerHTML;
    const w = window.open('', '_blank');
    w.document.write(`
      <html>
        <head>
          <title>Print Barcode</title>
          <style>
            @page {
              size: 38mm 25mm;
              margin: 0;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              width: 38mm;
              height: 25mm;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              font-family: Arial, sans-serif;
            }
            .title {
              font-size: 8px;
              font-weight: bold;
              text-align: center;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              max-width: 36mm;
              margin-bottom: 2px;
            }
            svg {
              width: 95% !important;
              height: auto !important;
              max-height: 16mm;
            }
            .price {
              font-size: 8px;
              font-weight: bold;
              margin-top: 1px;
            }
          </style>
        </head>
        <body>
          <div class="title">${barcodeFor?.name || ''}</div>
          ${svg}
          <div class="price">Rs. ${barcodeFor?.price || 0}</div>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `);
    w.document.close();
  }

  if (loading) return <div style={{ padding: 20 }}>Loading Inventory...</div>;

  return (
    <>
      {/* Inventory Header with top right action button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-sub" style={{ marginBottom: 16 }}>
            Manage your product categories, prices, stock levels and barcodes
          </p>
        </div>
        
        {/* Manager/Admin සඳහා පමණක් Add New Item Button එක පෙන්වයි */}
        {isManager && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setForm({ ...EMPTY })}
          >
            + Add New Item
          </button>
        )}
      </div>

      {/* Toolbar with Search Bar */}
      <div className="toolbar">
        <input
          type="text"
          className="search-box"
          placeholder="Search by name, barcode or vehicle type..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Inventory Table */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Barcode</th>
              <th>Vehicle</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map((item) => {
              const low = item.stockQty <= item.reorderLevel;
              const isOil = isOilCategory(item.category, item.name);
              const unitLabel = isOil ? (item.unitType || 'Liters') : '';
              return (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    {isOil && item.capacity && (
                      <span style={{ marginLeft: 6, fontSize: 11, background: '#eef3ef', color: 'var(--green)', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                        {item.capacity}
                      </span>
                    )}
                    {item.notes && <div className="cart-item-sub">{item.notes}</div>}
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: 'var(--muted)', background: '#f2f0ea', padding: '2px 7px', borderRadius: 12 }}>
                      {item.category || (isOil ? 'Oil' : 'Spare Parts')}
                    </span>
                  </td>
                  <td><span className="barcode-tag">{item.barcode}</span></td>
                  <td>{item.vehicleType || '—'}</td>
                  <td>{money(item.price)}</td>
                  <td>
                    <span className={`badge ${low ? 'badge-red' : 'badge-green'}`}>
                      {item.stockQty}{unitLabel ? ` ${unitLabel}` : ''}
                    </span>
                  </td>
                  <td>
                    {low ? (
                      <span className="badge badge-amber">Low Stock</span>
                    ) : (
                      <span className="badge badge-gray">OK</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => setBarcodeFor(item)}
                      >
                        Barcode
                      </button>

                      {isManager && (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                              setStockFor(item);
                              setStock({ change: '', reason: '' });
                            }}
                          >
                            Stock
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                              const itemIsOil = isOilCategory(item.category, item.name);
                              setForm({
                                id: item.id,
                                name: item.name,
                                category: item.category || (itemIsOil ? 'Oil' : 'Spare Parts'),
                                unitType: item.unitType || (itemIsOil ? 'Liters' : ''),
                                capacity: item.capacity || '',
                                vehicleType: item.vehicleType || '',
                                barcode: item.barcode,
                                price: item.price,
                                costPrice: item.costPrice,
                                stockQty: item.stockQty,
                                reorderLevel: item.reorderLevel,
                                notes: item.notes || '',
                              });
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => remove(item)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="empty-state">
            {activeItems.length === 0
              ? 'No items yet.'
              : 'No items match your search.'}
          </div>
        )}

        <Pagination
          currentPage={safeCurrentPage}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Add / Edit Modal */}
      <Modal open={!!form} onClose={() => setForm(null)}>
        {form && (
          <>
            <h2>{form.id ? 'Edit Item' : 'Add New Item'}</h2>
            
            <div className="grid-2">
              <div className="field">
                <label>Category</label>
                <select
                  value={form.category || 'Spare Parts'}
                  onChange={(e) => {
                    const cat = e.target.value;
                    const isOil = cat === 'Oil' || cat === 'Lubricants';
                    setForm({
                      ...form,
                      category: cat,
                      unitType: isOil ? (form.unitType || 'Liters') : '',
                      capacity: isOil ? (form.capacity || '') : '',
                    });
                  }}
                >
                  <option value="Spare Parts">Spare Parts</option>
                  <option value="Oil">Oil</option>
                  <option value="Lubricants">Lubricants</option>
                  <option value="Accessories">Accessories</option>
                  <option value="Electrical">Electrical</option>
                  <option value="Tires & Tubes">Tires & Tubes</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="field">
                <label>Item Name</label>
                <input
                  type="text"
                  placeholder="e.g. Engine Oil 20W-50 / Signal Light"
                  value={form.name}
                  onChange={setF('name')}
                />
              </div>
            </div>

            {(form.category === 'Oil' || form.category === 'Lubricants') && (
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
                    value={form.unitType || 'Liters'}
                    onChange={setF('unitType')}
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
                    value={form.capacity || ''}
                    onChange={setF('capacity')}
                  />
                </div>
              </div>
            )}

            <div className="grid-2">
              <div className="field">
                <label>Vehicle Type</label>
                <input
                  type="text"
                  placeholder="e.g. Tuk Tuk, Bike, Bus"
                  value={form.vehicleType}
                  onChange={setF('vehicleType')}
                />
              </div>
              <div className="field">
                <label>Barcode {!form.id && <span style={{ fontWeight: 400 }}>(blank = auto)</span>}</label>
                <input
                  type="text"
                  placeholder="Auto"
                  value={form.barcode}
                  onChange={setF('barcode')}
                  disabled={!!form.id}
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label>Selling Price (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0.00"
                  value={form.price}
                  onChange={(e) => {
                    const val = e.target.value.replace(/-/g, '');
                    setForm({ ...form, price: val });
                  }}
                />
              </div>
              <div className="field">
                <label>Cost Price (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0.00"
                  value={form.costPrice}
                  onChange={(e) => {
                    const val = e.target.value.replace(/-/g, '');
                    setForm({ ...form, costPrice: val });
                  }}
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label>
                  {form.id
                    ? `Current Stock ${form.category === 'Oil' || form.category === 'Lubricants' ? `(${form.unitType || 'Liters'})` : '(use “Stock” to change)'}`
                    : `Opening Stock Qty ${form.category === 'Oil' || form.category === 'Lubricants' ? `(${form.unitType || 'Liters'})` : ''}`}
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.stockQty}
                  onChange={(e) => {
               // Minus (-) ලකුණු සහ අකුරු ඉවත් කර ධන අංක පමණක් ඉතිරි කරයි
                  const val = e.target.value.replace(/-/g, '');
                  setForm({ ...form, stockQty: val });
                }}
                disabled={!!form.id}
                />
              </div>
              <div className="field">
                <label>Reorder Level</label>
                <input
                  type="number"
                  min="0"
                  placeholder="5"
                  value={form.reorderLevel}
                  onChange={(e) => {
                    const val = e.target.value.replace(/-/g, '');
                    setForm({ ...form, reorderLevel: val });
                  }}
                />
              </div>
            </div>

            <div className="field">
              <label>Notes (optional)</label>
              <input
                type="text"
                placeholder="e.g. supplier, part number"
                value={form.notes}
                onChange={setF('notes')}
              />
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={save}>Save Item</button>
            </div>
          </>
        )}
      </Modal>

      {/* Stock Adjust Modal */}
      <Modal open={!!stockFor} onClose={() => setStockFor(null)} width={360}>
        {stockFor && (
          <>
            <h2>Adjust Stock</h2>
            <p style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: -10 }}>
              {stockFor.name} — current stock: {stockFor.stockQty}
              {isOilCategory(stockFor.category, stockFor.name) ? ` ${stockFor.unitType || 'Liters'}` : ''}
            </p>
            <div className="field">
              <label>
                Add (+) or Remove (-) Quantity {isOilCategory(stockFor.category, stockFor.name) ? `(${stockFor.unitType || 'Liters'})` : ''}
              </label>
              <input
                type="number"
                placeholder="e.g. 10 or -2"
                value={stock.change}
                onChange={(e) => setStock({ ...stock, change: e.target.value })}
                autoFocus
              />
            </div>
            <div className="field">
              <label>Reason</label>
              <input
                type="text"
                placeholder="e.g. New delivery, damaged item"
                value={stock.reason}
                onChange={(e) => setStock({ ...stock, reason: e.target.value })}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setStockFor(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submitStock}>Update Stock</button>
            </div>
          </>
        )}
      </Modal>

      {/* Barcode Label Modal */}
      <Modal open={!!barcodeFor} onClose={() => setBarcodeFor(null)} width={340} align="center">
        {barcodeFor && (
          <>
            <h2>{barcodeFor.name}</h2>
            <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, background: '#fff' }}>
              <svg ref={svgRef} style={{ width: '100%', height: '80px' }} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              Print this label and stick it on the item / shelf
            </p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setBarcodeFor(null)}>Close</button>
              <button type="button" className="btn btn-primary" onClick={printBarcode}>Print</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}