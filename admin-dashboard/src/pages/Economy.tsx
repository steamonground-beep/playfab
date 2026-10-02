import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Economy() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [newItem, setNewItem] = useState({ itemId: '', displayName: '', category: '' });

  useEffect(() => {
    api<Array<Record<string, unknown>>>('/admin/catalog/items').then(setItems).catch(console.error);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api('/admin/catalog/items', { method: 'POST', body: JSON.stringify(newItem) });
    const updated = await api<Array<Record<string, unknown>>>('/admin/catalog/items');
    setItems(updated);
    setNewItem({ itemId: '', displayName: '', category: '' });
  }

  return (
    <div>
      <h1>Economy & Catalog</h1>
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2>Create Item</h2>
        <form onSubmit={handleCreate}>
          <input placeholder="Item ID" value={newItem.itemId} onChange={e => setNewItem({ ...newItem, itemId: e.target.value })} required />
          <input placeholder="Display Name" value={newItem.displayName} onChange={e => setNewItem({ ...newItem, displayName: e.target.value })} required />
          <input placeholder="Category" value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} />
          <button type="submit">Create Item</button>
        </form>
      </div>
      <div className="card">
        <h2>Catalog Items</h2>
        <table>
          <thead><tr><th>Item ID</th><th>Name</th><th>Category</th><th>Type</th></tr></thead>
          <tbody>
            {items.map(item => (
              <tr key={item.item_id as string}>
                <td>{item.item_id as string}</td>
                <td>{item.display_name as string}</td>
                <td>{item.category as string}</td>
                <td>{item.item_type as string}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
