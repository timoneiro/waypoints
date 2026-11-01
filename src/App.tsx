import { useEffect } from 'react'
import { HashRouter, Link, Outlet, Route, Routes, useLocation, useNavigationType } from 'react-router'
import { AutoSync } from './sync/useAutoSync'
import { EmptyState } from './ui/components/bits'
import { UpdateBanner } from './ui/components/UpdateBanner'
import { ActivityFormPage, ActivityPage } from './ui/items/activities'
import { AttachmentFormPage, AttachmentPage } from './ui/items/attachments'
import { ExchangeFormPage } from './ui/items/exchanges'
import { ExpenseFormPage, ExpensePage, MoneyPage } from './ui/items/expenses'
import { PlaceFormPage, PlacePage, PlacesPage } from './ui/items/places'
import { PlacesImportPage } from './ui/items/placesImport'
import { StayFormPage, StayPage } from './ui/items/stays'
import { TransportFormPage, TransportPage } from './ui/items/transport'
import { MoveToServerPage } from './ui/pages/MoveToServerPage'
import { OpenPage } from './ui/pages/OpenPage'
import { PhotoGroupPage, PhotoItemPage } from './ui/pages/PhotoGroupPage'
import { PhotosPage } from './ui/pages/PhotosPage'
import { PlanPage } from './ui/pages/PlanPage'
import { ReportPage } from './ui/pages/ReportPage'
import { PackingPage } from './ui/pages/PackingPage'
import { ReviewsPage } from './ui/pages/ReviewsPage'
import { ServerPage } from './ui/pages/ServerPage'
import { SettingsPage } from './ui/pages/SettingsPage'
import { SharePage } from './ui/pages/SharePage'
import { TripFormPage } from './ui/pages/TripFormPage'
import { TripInfoPage } from './ui/pages/TripInfoPage'
import { TripLinkPage } from './ui/pages/TripLinkPage'
import { TripsPage } from './ui/pages/TripsPage'
import { WhatsNewPage } from './ui/pages/WhatsNewPage'
import { TripLayout } from './ui/TripLayout'

export default function App() {
  return (
    // Hash routing keeps deep links working on GitHub Pages without server rewrites, and keeps trip
    // links' data in the fragment, which never reaches the server.
    <HashRouter>
      <ScrollToTop />
      <AutoSync />
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<TripsPage />} />
          <Route path="new" element={<TripFormPage />} />
          <Route path="open" element={<OpenPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="server" element={<ServerPage />} />
          <Route path="whats-new" element={<WhatsNewPage />} />
          <Route path="t/:data" element={<TripLinkPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="trips/:tripId" element={<TripLayout />}>
          <Route index element={<PlanPage />} />
          <Route path="places" element={<PlacesPage />} />
          <Route path="money" element={<MoneyPage />} />
          <Route path="photos" element={<PhotosPage />} />
          <Route path="photos/:group" element={<PhotoGroupPage />} />
          <Route path="photos/:group/:itemId" element={<PhotoItemPage />} />
          <Route path="reviews" element={<ReviewsPage />} />
          <Route path="packing" element={<PackingPage />} />
          <Route path="report" element={<ReportPage />} />
          <Route path="trip" element={<TripInfoPage />} />
          <Route path="edit" element={<TripFormPage />} />
          <Route path="share" element={<SharePage />} />
          <Route path="server" element={<MoveToServerPage />} />
          <Route path="stays/new" element={<StayFormPage />} />
          <Route path="stays/:itemId" element={<StayPage />} />
          <Route path="stays/:itemId/edit" element={<StayFormPage />} />
          <Route path="transport/new" element={<TransportFormPage />} />
          <Route path="transport/:itemId" element={<TransportPage />} />
          <Route path="transport/:itemId/edit" element={<TransportFormPage />} />
          <Route path="activities/new" element={<ActivityFormPage />} />
          <Route path="activities/:itemId" element={<ActivityPage />} />
          <Route path="activities/:itemId/edit" element={<ActivityFormPage />} />
          <Route path="places/new" element={<PlaceFormPage />} />
          <Route path="places/import" element={<PlacesImportPage />} />
          <Route path="places/:itemId" element={<PlacePage />} />
          <Route path="places/:itemId/edit" element={<PlaceFormPage />} />
          <Route path="expenses/new" element={<ExpenseFormPage />} />
          <Route path="expenses/:itemId" element={<ExpensePage />} />
          <Route path="expenses/:itemId/edit" element={<ExpenseFormPage />} />
          <Route path="exchanges/new" element={<ExchangeFormPage />} />
          <Route path="exchanges/:itemId/edit" element={<ExchangeFormPage />} />
          <Route path="files/:itemId" element={<AttachmentPage />} />
          <Route path="files/:itemId/edit" element={<AttachmentFormPage />} />
        </Route>
      </Routes>
      <UpdateBanner />
    </HashRouter>
  )
}

function MainLayout() {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" to="/">
            📍 waypoints
          </Link>
          <Link className="icon-btn" to="/settings" aria-label="Settings">
            ⚙️
          </Link>
        </div>
      </header>
      <main className="page page-plain">
        <Outlet />
      </main>
    </>
  )
}

/** New pages start at the top; going back leaves the scroll where the browser puts it. */
function ScrollToTop() {
  const { pathname } = useLocation()
  const type = useNavigationType()
  useEffect(() => {
    if (type !== 'POP') window.scrollTo(0, 0)
  }, [pathname, type])
  return null
}

function NotFound() {
  return (
    <EmptyState>
      <p className="big-emoji">🧭</p>
      <p>There's nothing here.</p>
      <Link className="btn" to="/">
        Your trips
      </Link>
    </EmptyState>
  )
}
