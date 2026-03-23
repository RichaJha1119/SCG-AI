import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex min-h-[100dvh] bg-[#f8f8fb] text-[#09090b] overflow-hidden md:h-screen md:flex-row flex-col">
      <Sidebar />
      <main className="relative flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#f9f9fb_46%,#f3f3f5_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.09),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.08),transparent_45%)]" />
        <div className="relative flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
