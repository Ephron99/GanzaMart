import { Link } from 'react-router-dom';

// The underlined section title with an optional "View all →" on the right. Used on the
// home rails (Featured, Best selling, New arrivals) so all three match.
export default function SectionHead({ title, linkTo, linkLabel = 'View all' }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {linkTo && <Link className="section-head__link" to={linkTo}>{linkLabel} →</Link>}
    </div>
  );
}
