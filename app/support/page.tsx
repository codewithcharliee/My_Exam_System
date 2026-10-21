import { PublicInformationPage } from '@/components/layouts/public-information-page';

export const metadata = { title: 'Support | Faculty of Law Online Examination System' };

export default function SupportPage() {
  return (
    <PublicInformationPage
      title="Support"
      summary="Use the support options provided within the examination system."
    >
      <section>
        <h2 className="text-lg font-semibold">Technical issue during an examination</h2>
        <p className="mt-2 text-muted-foreground">
          While an examination is active, select <strong>Report issue</strong> in the examination header and briefly describe the problem. Reports are available to authorized examination staff for review. Do not include your password or other sign-in credentials in a report.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Other questions</h2>
        <p className="mt-2 text-muted-foreground">
          For account, course, assessment, or policy questions, contact the appropriate Faculty of Law or University office through its official channels. No direct support email address or phone number is configured in this system, so none is listed here.
        </p>
      </section>
    </PublicInformationPage>
  );
}