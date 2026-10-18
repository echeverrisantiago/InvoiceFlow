import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Términos y Condiciones - EntraFactura',
  description:
    'Términos y Condiciones de uso del servicio de gestión de facturas EntraFactura.',
};

const UPDATED_AT = '18 de octubre de 2026';
const CONTACT_EMAIL = 'soporte@entrafactura.com';

export default function TerminosPage() {
  return (
    <LegalPage title="Términos y Condiciones" updatedAt={UPDATED_AT}>
      <p>
        Estos Términos y Condiciones (los &quot;Términos&quot;) regulan el acceso y uso del
        servicio EntraFactura (el &quot;Servicio&quot;). Al crear una cuenta o utilizar el
        Servicio aceptas estos Términos y nuestra{' '}
        <a href="/privacidad">Política de Privacidad</a>.
      </p>

      <h2>1. Aceptación</h2>
      <p>
        Al registrarte, acceder o usar el Servicio declaras ser mayor de edad, tener
        capacidad legal para contratar y aceptar íntegramente estos Términos. Si actúas en
        nombre de una empresa, declaras tener facultades para obligarla.
      </p>

      <h2>2. Descripción del Servicio</h2>
      <p>
        EntraFactura es un servicio en la nube para la gestión de facturas dirigido a PYMEs.
        Incluye, entre otras funciones, la carga de facturas, la extracción automática de
        datos (incluyendo mediante inteligencia artificial), el respaldo en la nube, la
        sincronización de facturas desde cuentas de correo y alertas de vencimiento.
      </p>

      <h2>3. Registro y cuenta</h2>
      <ul>
        <li>Debes proporcionar información veraz, exacta y actualizada.</li>
        <li>
          Eres responsable de la confidencialidad de tus credenciales y de toda actividad
          realizada desde tu cuenta.
        </li>
        <li>
          Las cuentas se organizan por empresa (multi-tenant) con roles de administrador y
          miembro. El administrador gestiona la suscripción y la configuración.
        </li>
        <li>Debes notificarnos de inmediato cualquier uso no autorizado de tu cuenta.</li>
      </ul>

      <h2>4. Planes y precios</h2>
      <p>El Servicio se ofrece mediante planes de suscripción mensual o anual:</p>
      <table>
        <thead>
          <tr>
            <th>Plan</th>
            <th>Precio mensual</th>
            <th>Precio anual</th>
            <th>Facturas / mes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Básico</td>
            <td>$69.000 COP</td>
            <td>$690.000 COP</td>
            <td>50</td>
          </tr>
          <tr>
            <td>Profesional</td>
            <td>$119.000 COP</td>
            <td>$1.190.000 COP</td>
            <td>200</td>
          </tr>
          <tr>
            <td>Empresarial</td>
            <td>$265.000 COP</td>
            <td>$2.650.000 COP</td>
            <td>500</td>
          </tr>
        </tbody>
      </table>
      <p>
        El plan anual equivale a pagar 10 meses y obtener 12. Los precios pueden
        actualizarse; cualquier cambio se comunicará con antelación razonable. El límite de
        facturas se cuenta por mes calendario (se reinicia el día 1) y aplica tanto a
        facturas cargadas manualmente como a las obtenidas por correo.
      </p>

      <h2>5. Pagos y suscripción</h2>
      <ul>
        <li>
          Los pagos y suscripciones recurrentes se procesan a través de Mercado Pago
          (débito automático).
        </li>
        <li>Al registrarte puedes acceder a un periodo de prueba gratuito de 30 días.</li>
        <li>
          Puedes cambiar de plan o periodicidad, o cancelar en cualquier momento. Al cancelar
          conservas el acceso hasta el final del periodo ya pagado.
        </li>
        <li>
          Salvo que la ley exija lo contrario, los pagos realizados no son reembolsables.
        </li>
      </ul>

      <h2>6. Uso aceptable</h2>
      <p>Te comprometes a no utilizar el Servicio para:</p>
      <ul>
        <li>Subir o procesar contenido ilícito, fraudulento o que infrinja derechos de terceros.</li>
        <li>Intentar acceder a datos de otras organizaciones o vulnerar la seguridad del Servicio.</li>
        <li>Realizar ingeniería inversa, revender o explotar el Servicio sin autorización.</li>
        <li>Sobrecargar la infraestructura o eludir los límites de uso.</li>
      </ul>

      <h2>7. Extracción con inteligencia artificial</h2>
      <p>
        La extracción automática de datos de facturas (por IA o por lectura de facturas
        electrónicas) es una ayuda y <strong>puede contener errores</strong>. El Servicio no
        garantiza que los datos extraídos sean exactos, completos o suficientes para fines
        contables, tributarios o legales. Es tu responsabilidad revisar y validar la
        información antes de usarla. EntraFactura no presta asesoría contable, fiscal ni
        legal.
      </p>

      <h2>8. Propiedad intelectual</h2>
      <p>
        El Servicio, su software, marca y contenido son propiedad de EntraFactura o de sus
        licenciantes. Conservas la titularidad de las facturas y datos que subes; nos otorgas
        una licencia limitada para tratarlos con la única finalidad de prestar el Servicio.
      </p>

      <h2>9. Disponibilidad y soporte</h2>
      <p>
        Procuramos mantener el Servicio disponible de forma continua, pero puede haber
        interrupciones por mantenimiento, actualizaciones o causas ajenas a nuestro control.
        El soporte se presta a través de{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>10. Limitación de responsabilidad</h2>
      <p>
        En la medida máxima permitida por la ley, EntraFactura no será responsable por daños
        indirectos, incidentales o consecuentes, ni por lucro cesante, pérdida de datos o
        decisiones tomadas con base en información extraída por el Servicio. La
        responsabilidad total de EntraFactura se limita al monto pagado por el Servicio
        durante los tres (3) meses anteriores al evento que originó la reclamación.
      </p>

      <h2>11. Terminación</h2>
      <p>
        Podemos suspender o cancelar tu cuenta si incumples estos Términos o si es necesario
        por seguridad o por la ley. Puedes cancelar tu cuenta en cualquier momento. Tras la
        terminación, podremos eliminar tus datos conforme a nuestra Política de Privacidad,
        sin perjuicio de las obligaciones legales de conservación.
      </p>

      <h2>12. Ley aplicable y solución de controversias</h2>
      <p>
        Estos Términos se rigen por las leyes de la República de Colombia. Cualquier
        controversia se intentará resolver de buena fe mediante comunicación directa; en su
        defecto, se someterá a la jurisdicción de los jueces competentes en Colombia.
      </p>

      <h2>13. Cambios a los Términos</h2>
      <p>
        Podemos modificar estos Términos en cualquier momento. Los cambios relevantes se
        comunicarán por los canales del Servicio y entrarán en vigor desde su publicación. El
        uso continuado del Servicio implica su aceptación.
      </p>

      <h2>14. Contacto</h2>
      <p>
        Para preguntas sobre estos Términos, escríbenos a{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
