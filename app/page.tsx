import Image from "next/image";
import { FECHAS_SORTEO, formatoFecha, instanteSorteo, sorteoActual, TEAMS_LINK } from "@/lib/sorteo";
import InscripcionForm from "@/components/InscripcionForm";

export const dynamic = "force-dynamic";

const OFERTAS = [
  { name: "Paquete X4", price: "$1.350.000" },
  { name: "Paquete X3", price: "$1.100.000" },
  { name: "Paquete X2", price: "$890.000" },
  { name: "Paquete X1", price: "$650.000" },
];

export default function Home() {
  const now = new Date();
  const actual = sorteoActual(now);

  return (
    <>
      <section className="hero">
        <span className="tag">SORTEO SEMANAL · REGRESO ISO POWER PACK</span>
        <h1>
          Gana hasta <em>50% de descuento</em> en tu paquete ISO
        </h1>
        <p>
          Inscríbete para participar en el sorteo semanal que se realiza <strong>cada viernes a las 4:00 pm</strong>, del
          20 de noviembre al 11 de diciembre. Cada semana hay <strong>2 ganadores</strong>.
        </p>
      </section>

      <section className="grid grid-2">
        <div className="card prize">
          <div className="pct">50%</div>
          <div className="lbl">1er ganador · descuento en el paquete que escoja</div>
        </div>
        <div className="card prize">
          <div className="pct">30%</div>
          <div className="lbl">2do ganador · descuento en el paquete que escoja</div>
        </div>
      </section>

      <section className="section card">
        <h2><span className="bar" />Fechas de los sorteos (4:00 pm)</h2>
        <div className="grid grid-4">
          {FECHAS_SORTEO.map((f) => {
            const past = now >= instanteSorteo(f);
            return (
              <div key={f} className={`date-chip ${f === actual ? "current" : ""} ${past ? "past" : ""}`}>
                <strong>{formatoFecha(f)}</strong>
                <small>{past ? "Realizado" : f === actual ? "Sorteo de esta semana" : "Próximo"}</small>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section card">
        <h2><span className="bar" />¿Cómo participar?</h2>
        <ul className="rules">
          <li>Llena el formulario con tus datos personales y el comercial que te atiende.</li>
          <li>
            Cada número de documento se inscribe <strong>una sola vez</strong> y la inscripción es válida <strong>solo para el sorteo de la semana en curso</strong>.
            Quien ya participó en un sorteo no puede volver a participar, salvo que traiga un referido con el abono validado.
          </li>
          <li>
            Para participar en la semana siguiente debes <strong>traer un referido</strong>: tu referido se inscribe
            escribiendo <strong>tu número de documento</strong> y debe abonar <strong>mínimo $200.000</strong> a su paquete.
            Participas en la semana en que tu referido se inscribe, una vez el área comercial valide su abono.
          </li>
          <li>Solo hay 2 ganadores por semana: uno obtiene 50% y otro 30% de descuento en el paquete que escoja.</li>
          <li>
            <strong>Para que el premio sea válido debes estar conectado a la reunión de Teams del sorteo</strong>{" "}
            el viernes a las 4:00 pm. Si el ganador no está conectado, la ruleta vuelve a girar.{" "}
            <a href={TEAMS_LINK} target="_blank" rel="noopener noreferrer"><strong>Unirme a la reunión de Teams</strong></a>.
          </li>
          <li>
            También puedes seguir la ruleta <strong>en vivo</strong> en{" "}
            <a href="/en-vivo"><strong>sorteo.centicsas.com.co/en-vivo</strong></a>.
          </li>
        </ul>
      </section>

      <section className="section card offers">
        <h2><span className="bar" />Ofertas · Regreso ISO Power Pack</h2>
        <p className="muted">Certificaciones ISO 42001 · ISO 9001 · ISO 27001 · ISO 22301. Certificación extra: 70 USD.</p>
        <div className="grid grid-4 offer-cards">
          {OFERTAS.map((o) => (
            <div className="offer" key={o.name}>
              <div className="name">{o.name}</div>
              <div className="price">{o.price}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <Image src="/ofertas.jpeg" alt="Tabla de ofertas ISO Power Pack" width={1575} height={256} />
        </div>
      </section>

      <section className="section card" id="inscripcion">
        <h2><span className="bar" />Inscripción</h2>
        {actual ? (
          <InscripcionForm sorteo={actual} sorteoLabel={formatoFecha(actual)} />
        ) : (
          <div className="alert error">Las inscripciones están cerradas: ya se realizaron todos los sorteos.</div>
        )}
      </section>
    </>
  );
}
