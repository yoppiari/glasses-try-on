import KasirOutletPanel from '../KasirOutletPanel'
import CrmAdminDashboard from '../CrmAdminDashboard'
import CatalogAdminPanel from '../CatalogAdminPanel'
import { AppHeader } from '../brand/Brand'
import { NavLink, PATHS } from '../../lib/routes'

const MENU = [
  { route: 'kasir', label: 'Kasir', path: PATHS.kasir },
  { route: 'laporan', label: 'Laporan', path: PATHS.laporan },
  { route: 'katalog', label: 'Katalog', path: PATHS.katalog },
]

/**
 * Aplikasi staf DOOZ (`/staf`) — terpisah dari aplikasi customer.
 * 3 menu: Kasir, Laporan (termasuk link overlay OBS Live), Katalog.
 */
export default function StaffApp({ route }) {
  return (
    <div className="dz-page">
      <AppHeader subtitle="Aplikasi Staf" />
      <nav className="staff-nav" aria-label="Menu staf">
        {MENU.map((item) => (
          <NavLink
            key={item.route}
            to={item.path}
            className={`dz-tab ${route === item.route ? 'is-active' : ''}`}
            aria-current={route === item.route ? 'page' : undefined}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main className="dz-page__body">
        <div className="dz-container">
          {route === 'kasir' && <KasirOutletPanel />}
          {route === 'laporan' && <CrmAdminDashboard />}
          {route === 'katalog' && <CatalogAdminPanel />}
        </div>
      </main>
    </div>
  )
}
