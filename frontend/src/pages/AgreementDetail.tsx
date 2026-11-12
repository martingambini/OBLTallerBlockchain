import { useParams } from "react-router-dom";

export function AgreementDetail() {
  const { id } = useParams();

  return (
    <section>
      <h1>Detalle del acuerdo #{id}</h1>
      <p>Pantalla pendiente (etapa E9).</p>
    </section>
  );
}
