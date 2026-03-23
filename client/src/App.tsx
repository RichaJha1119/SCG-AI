import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

const Home = lazy(() => import('./pages/Home'));
const Generator = lazy(() => import('./pages/Generator'));
const Library = lazy(() => import('./pages/Library'));
const Settings = lazy(() => import('./pages/Settings'));

function RouteFallback() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-[#f8f8fb] text-[#5b6170]">
      <div className="px-4 py-2 rounded-lg border border-black/10 bg-white/85 text-sm">
        Loading...
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={(
            <Suspense fallback={<RouteFallback />}>
              <Home />
            </Suspense>
          )}
        />
        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<Layout />}>
            <Route
              index
              element={(
                <Suspense fallback={<RouteFallback />}>
                  <Generator />
                </Suspense>
              )}
            />
            <Route
              path="library"
              element={(
                <Suspense fallback={<RouteFallback />}>
                  <Library />
                </Suspense>
              )}
            />
            <Route
              path="settings"
              element={(
                <Suspense fallback={<RouteFallback />}>
                  <Settings />
                </Suspense>
              )}
            />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
