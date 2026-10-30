import { cx } from '../utils/format.js';

// A small status pill. `variant` picks the colour from base.css (.badge--sale, etc.).
export default function Badge({ variant = 'default', children, className, ...rest }) {
  return (
    <span className={cx('badge', variant !== 'default' && `badge--${variant}`, className)} {...rest}>
      {children}
    </span>
  );
}
