import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Spinner } from "./components/ui";
import "./index.css";
import { PlaceProvider, SessionProvider } from "./lib/session";
import PlayerLayout from "./pages/PlayerLayout";
import Home from "./pages/Home";
import VenuePage from "./pages/Venue";
import Checkout from "./pages/Checkout";
import Ticket from "./pages/Ticket";
import MyGames from "./pages/MyGames";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// The venue dashboard is its own bundle so players never download it.
const OwnerApp = lazy(() => import("./pages/owner/OwnerApp"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <PlaceProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<PlayerLayout />}>
                <Route index element={<Home />} />
                <Route path="v/:slug" element={<VenuePage />} />
                <Route path="checkout/:groupId" element={<Checkout />} />
                <Route path="ticket/:groupId" element={<Ticket />} />
                <Route path="games" element={<MyGames />} />
                <Route path="login" element={<Login />} />
                <Route path="*" element={<NotFound />} />
              </Route>
              <Route
                path="owner/*"
                element={
                  <Suspense fallback={<Spinner label="Opening the dugout" />}>
                    <OwnerApp />
                  </Suspense>
                }
              />
            </Routes>
          </BrowserRouter>
        </PlaceProvider>
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
