import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Política de Privacidad - EntraFactura',
  description:
    'Política de Privacidad y Tratamiento de Datos Personales de EntraFactura, conforme a la Ley 1581 de 2012 de Colombia.',
};

const UPDATED_AT = '18 de octubre de 2026';
const CONTACT_EMAIL = 'soporte@entrafactura.com';

export default function PrivacidadPage() {
  return (
    <LegalPage title="Política de Privacidad" updatedAt={UPDATED_AT}>
      <p>
        En EntraFactura nos tomamos en serio la protección de tus datos personales. Esta
        Política de Privacidad describe qué información recolectamos, con qué finalidad la
        tratamos, con quién la compartimos y cómo puedes ejercer tus derechos como titular,
        conforme a la Ley 1581 de 2012, el Decreto 1377 de 2013 y las demás normas
        colombianas aplicables en materia de protección de datos personales.
      </p>

      <h2>1. Responsable del tratamiento</h2>
      <p>
        El responsable del tratamiento de tus datos personales es:
      </p>
      <table>
        <tbody>
          <tr>
            <th>Nombre comercial</th>
            <td>EntraFactura</td>
          </tr>
          <tr>
            <th>Responsable</th>
            <td>EntraFactura (proyecto operado por su fundador)</td>
          </tr>
          <tr>
            <th>Correo de contacto y habeas data</th>
            <td>{CONTACT_EMAIL}</td>
          </tr>
          <tr>
            <th>País</th>
            <td>Colombia</td>
          </tr>
          <tr>
            <th>Identificación y domicilio</th>
            <td>
              Disponibles a solicitud del titular escribiendo al correo de contacto.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>2. Datos personales que recolectamos</h2>
      <p>Para prestar el servicio podemos tratar las siguientes categorías de datos:</p>
      <ul>
        <li>
          <strong>Datos de identificación y contacto:</strong> nombre completo, correo
          electrónico y contraseña (almacenada de forma cifrada).
        </li>
        <li>
          <strong>Datos de la organización:</strong> nombre de la empresa y NIT, cuando
          decides ingresarlos.
        </li>
        <li>
          <strong>Datos de facturas:</strong> proveedor, NIT del proveedor, fechas de emisión
          y vencimiento, subtotal, IVA, total, descripción y el archivo de la factura que
          subes o que se obtiene desde tus correos.
        </li>
        <li>
          <strong>Cuentas de correo conectadas:</strong> al vincular Gmail u Outlook,
          accedemos a los correos y adjuntos necesarios para identificar facturas. No
          accedemos a contenidos ajenos a esta finalidad.
        </li>
        <li>
          <strong>Datos de uso y técnicos:</strong> registros de acceso, dirección IP y datos
          del dispositivo, con fines de seguridad y funcionamiento.
        </li>
      </ul>

      <h2>3. Finalidades del tratamiento</h2>
      <ul>
        <li>Crear y administrar tu cuenta y el acceso al servicio.</li>
        <li>Procesar, extraer, organizar y respaldar tus facturas.</li>
        <li>Sincronizar facturas desde las cuentas de correo que conectes.</li>
        <li>Guardar copias de respaldo en servicios de almacenamiento en la nube que autorices.</li>
        <li>Enviarte alertas de vencimiento y notificaciones relacionadas con el servicio.</li>
        <li>Gestionar la suscripción, los pagos y la facturación del servicio.</li>
        <li>Prestar soporte, atender solicitudes y mejorar el producto.</li>
        <li>Cumplir obligaciones legales y prevenir fraudes o usos indebidos.</li>
      </ul>

      <h2>4. Base legal y autorización</h2>
      <p>
        El tratamiento se realiza con base en la autorización previa, expresa e informada que
        otorgas al registrarte y aceptar esta política, así como en la ejecución del contrato
        de prestación del servicio y en el cumplimiento de obligaciones legales. Puedes
        revocar la autorización en cualquier momento, salvo cuando exista un deber legal de
        conservar los datos.
      </p>

      <h2>5. Encargados y terceros</h2>
      <p>
        Para operar el servicio nos apoyamos en proveedores que pueden tratar datos por
        cuenta nuestra o como responsables independientes:
      </p>
      <ul>
        <li><strong>Supabase</strong> — autenticación, base de datos y almacenamiento.</li>
        <li><strong>Groq</strong> — procesamiento con inteligencia artificial para extraer datos de facturas.</li>
        <li><strong>SendGrid</strong> — envío de correos y alertas.</li>
        <li><strong>Google</strong> — almacenamiento en Google Drive y acceso a Gmail, cuando lo autorizas.</li>
        <li><strong>Microsoft</strong> — acceso a Outlook y almacenamiento en OneDrive, cuando lo autorizas.</li>
        <li><strong>Mercado Pago</strong> — procesamiento de pagos y suscripciones.</li>
        <li><strong>Upstash</strong> — limitación de tasa y protección frente a abusos.</li>
        <li>
          <strong>Sentry</strong> — monitoreo de errores de la aplicación (configurado para
          no identificar al usuario).
        </li>
        <li><strong>Vercel</strong> — alojamiento e infraestructura de la aplicación.</li>
      </ul>
      <p>
        No vendemos ni alquilamos tus datos personales. Solo los compartimos con estos
        proveedores en la medida necesaria para prestar el servicio o cuando la ley lo exija.
      </p>

      <h2>6. Transferencias internacionales</h2>
      <p>
        Algunos de nuestros proveedores se encuentran fuera de Colombia. Al aceptar esta
        política autorizas la transferencia y transmisión internacional de tus datos a
        dichos proveedores, los cuales adoptan medidas de seguridad y confidencialidad
        adecuadas conforme a los estándares aplicables.
      </p>

      <h2>7. Conservación de los datos</h2>
      <p>
        Conservamos tus datos mientras tu cuenta esté activa y durante el tiempo necesario
        para cumplir las finalidades descritas, atender obligaciones legales, contables o
        fiscales, y resolver posibles controversias. Cuando ya no sean necesarios, los
        eliminamos o anonimizamos de forma segura.
      </p>

      <h2>8. Seguridad de la información</h2>
      <p>
        Implementamos medidas técnicas y organizativas para proteger tu información, entre
        ellas cifrado de credenciales y tokens de acceso, controles de acceso por
        organización (multi-tenant), políticas de seguridad a nivel de fila y limitación de
        tasa en los endpoints sensibles. Ningún sistema es completamente infalible, por lo
        que te recomendamos mantener seguras tus credenciales.
      </p>

      <h2>9. Tus derechos como titular</h2>
      <p>Conforme a la ley, tienes derecho a:</p>
      <ul>
        <li>Conocer, actualizar y rectificar tus datos personales.</li>
        <li>Solicitar prueba de la autorización otorgada.</li>
        <li>Ser informado sobre el uso que se ha dado a tus datos.</li>
        <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC).</li>
        <li>Revocar la autorización y solicitar la supresión de tus datos, cuando sea procedente.</li>
        <li>Acceder de forma gratuita a tus datos personales.</li>
      </ul>
      <p>
        Puedes ejercer estos derechos escribiendo a{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Atenderemos tu solicitud en
        los términos y plazos previstos por la ley.
      </p>

      <h2>10. Cookies</h2>
      <p>
        Utilizamos cookies y tecnologías similares estrictamente necesarias para la
        autenticación, la seguridad y el funcionamiento del servicio. Puedes configurar tu
        navegador para bloquear o eliminar cookies, aunque esto podría afectar el
        funcionamiento de algunas funciones.
      </p>

      <h2>11. Menores de edad</h2>
      <p>
        El servicio está dirigido a empresas y personas mayores de edad. No recolectamos de
        forma consciente datos de menores de edad. Si detectamos que hemos recibido datos de
        un menor sin autorización, procederemos a eliminarlos.
      </p>

      <h2>12. Cambios a esta política</h2>
      <p>
        Podemos actualizar esta política para reflejar cambios legales u operativos. Cuando
        los cambios sean relevantes, te lo informaremos por los canales del servicio. La
        fecha de última actualización se indica al inicio de esta página.
      </p>

      <h2>13. Contacto</h2>
      <p>
        Para preguntas sobre esta política o el tratamiento de tus datos, escríbenos a{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
