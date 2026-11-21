export function ProcessingNotice({mode}: {mode: string}) {
  return <p>
    {mode === 'local' ? 'AI processing runs on the service operator’s computer. Jobs wait while that computer is offline. Your profile and results are stored in the hosted workspace. ' : 'Review how your profile is processed before adding personal information. '}
    <a href="/hosted/privacy">Privacy and processing</a>
  </p>;
}
