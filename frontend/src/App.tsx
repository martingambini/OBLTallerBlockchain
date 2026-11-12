import { Header } from "./components/Header";
import { RequireWallet } from "./components/RequireWallet";

export function App() {
  return (
    <>
      <Header />
      <main className="content">
        <RequireWallet>
          <h1>Vesting de pagos</h1>
        </RequireWallet>
      </main>
    </>
  );
}
