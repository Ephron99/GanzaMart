// The context owns the state; this re-export gives pages a stable import path
// (`hooks/useAuth`) so they never reach into context/ for implementation details.
export { useAuth } from '../context/AuthContext.jsx';
