import { PublicInformationPage } from '@/components/layouts/public-information-page';

export const metadata = { title: 'Privacy Policy | Faculty of Law Online Examination System' };

export default function PrivacyPolicyPage() {
  return (
    <PublicInformationPage
      title="Privacy Policy"
      summary="This notice describes how information is used when you access the Faculty of Law Online Examination System."
    >
      <section>
        <h2 className="text-lg font-semibold">Information processed</h2>
        <p className="mt-2 text-muted-foreground">
          The system processes account and academic profile details, course and assessment activity, examination responses and submissions, grades, and support reports. Examination integrity features may also record session events and, where enabled for an assessment, camera-based monitoring or examination snapshots.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">How information is used</h2>
        <p className="mt-2 text-muted-foreground">
          Information is used to authenticate users, deliver and administer assessments, save and grade submissions, protect examination integrity, review reported technical issues, and maintain academic records.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">AI-assisted features</h2>
        <p className="mt-2 text-muted-foreground">
          When an authorized user chooses an AI feature, the material and text submitted to that feature may be sent to the system&apos;s configured AI provider for processing. Do not submit unnecessary sensitive or personal information to AI tools.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Access, security, and retention</h2>
        <p className="mt-2 text-muted-foreground">
          Access to system records is controlled through user roles and permissions. Records are retained according to applicable university examination and record-management requirements; this notice does not specify a retention period.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Questions</h2>
        <p className="mt-2 text-muted-foreground">
          For system support guidance, see the <a className="font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/support">Support page</a>. Official university privacy and records policies take precedence where applicable.
        </p>
      </section>
    </PublicInformationPage>
  );
}