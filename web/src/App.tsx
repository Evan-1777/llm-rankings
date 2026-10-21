import { useEffect } from "react";
import {
  createBrowserRouter,
  isRouteErrorResponse,
  Outlet,
  RouterProvider,
  useLocation,
  useNavigate,
  useRouteError,
} from "react-router-dom";
import { Button } from "./components/Button";
import { Header } from "./components/Header";
import { PageHeading } from "./components/PageHeading";
import { EmptyState } from "./components/States";
import { ToastProvider } from "./components/Toast";
import { ConfirmProvider } from "./components/Confirm";
import { useDocumentTitle } from "./lib/useDocumentTitle";
import { Compare } from "./pages/Compare";
import { Login } from "./pages/Login";
import { ModelDetail } from "./pages/ModelDetail";
import { Rankings } from "./pages/Rankings";
import { Settings } from "./pages/Settings";
import { Workbench } from "./pages/Workbench";
import { RequireAdmin } from "./session/RequireAdmin";
import { SessionProvider } from "./session/SessionProvider";
import styles from "./App.module.css";

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);
  return null;
}

function RootLayout() {
  return (
    <>
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <Header />
      <main id="main">
        <ScrollToTop />
        <Outlet />
      </main>
    </>
  );
}

function NotFound() {
  useDocumentTitle("页面不存在");
  const navigate = useNavigate();
  return (
    <div className="shell page-enter">
      <PageHeading kicker="404 / 未找到" title="页面不存在" />
      <EmptyState title="没有找到这个地址" text="链接可能已经失效，或模型已被移除。">
        <Button variant="primary" onClick={() => navigate("/")}>
          返回排行
        </Button>
      </EmptyState>
    </div>
  );
}

function RouteError() {
  useDocumentTitle("页面出错");
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? "页面无法加载。" : "页面渲染时发生错误。";
  return (
    <div className="shell page-enter">
      <PageHeading kicker="错误 / 500" title="页面出错" />
      <EmptyState title="未能完成这次请求" text={message}>
        <Button variant="primary" onClick={() => window.location.reload()}>
          重新加载
        </Button>
        <Button onClick={() => window.location.assign("/")}>返回排行</Button>
      </EmptyState>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: (
      <div className={styles.errorShell}>
        <RouteError />
      </div>
    ),
    children: [
      { path: "/", element: <Rankings /> },
      { path: "/models/:slug", element: <ModelDetail /> },
      { path: "/compare", element: <Compare /> },
      { path: "/login", element: <Login /> },
      {
        path: "/workbench",
        element: (
          <RequireAdmin>
            <Workbench />
          </RequireAdmin>
        ),
      },
      {
        path: "/settings",
        element: (
          <RequireAdmin>
            <Settings />
          </RequireAdmin>
        ),
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
