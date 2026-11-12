import { Navigate, Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { RequireWallet } from "./components/RequireWallet";
import { AgreementDetail } from "./pages/AgreementDetail";
import { CreateAgreement } from "./pages/CreateAgreement";
import { CreatedAgreements } from "./pages/CreatedAgreements";
import { MyIncome } from "./pages/MyIncome";

export function App() {
  return (
    <>
      <Header />
      <main className="content">
        <RequireWallet>
          <Routes>
            <Route path="/" element={<Navigate to="/create" replace />} />
            <Route path="/create" element={<CreateAgreement />} />
            <Route path="/created" element={<CreatedAgreements />} />
            <Route path="/income" element={<MyIncome />} />
            <Route path="/agreements/:id" element={<AgreementDetail />} />
            <Route path="*" element={<Navigate to="/create" replace />} />
          </Routes>
        </RequireWallet>
      </main>
    </>
  );
}
