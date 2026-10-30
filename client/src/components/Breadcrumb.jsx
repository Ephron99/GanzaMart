import { Link } from 'react-router-dom';

// Home / Electronics / Phones  — each step but the last is a live link.
export default function Breadcrumb({ items = [] }) {
  return (
    <ol className="breadcrumb">
      <li><Link to="/">Home</Link></li>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <li key={`${item.label}-${i}`}>
            {item.to && !last
              ? <Link to={item.to}>{item.label}</Link>
              : <span aria-current={last ? 'page' : undefined}>{item.label}</span>}
          </li>
        );
      })}
    </ol>
  );
}
