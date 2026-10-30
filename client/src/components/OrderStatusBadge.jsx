import Badge from './Badge.jsx';

// Maps an order's status to a badge colour + friendly label in one place, so the
// order list and the order detail can never describe the same state differently.
const MAP = {
  pending: { variant: 'low', label: 'Pending' },
  confirmed: { variant: 'verified', label: 'Confirmed' },
  processing: { variant: 'new', label: 'Processing' },
  shipped: { variant: 'sale', label: 'Shipped' },
  delivered: { variant: 'verified', label: 'Delivered' },
  cancelled: { variant: 'out', label: 'Cancelled' },
  refunded: { variant: 'out', label: 'Refunded' },
};

export default function OrderStatusBadge({ status }) {
  const entry = MAP[status] ?? { variant: 'default', label: status };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}
