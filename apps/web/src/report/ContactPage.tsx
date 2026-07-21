import { useState, type FormEvent } from 'react';

// Free Web3Forms relay → mladenqdev@gmail.com. The access key is public by
// design (it only authorizes sending TO the account's verified email), so it's
// safe in client code. Get it in 30s at https://web3forms.com (sign up with
// mladenqdev@gmail.com) and paste it below.
const WEB3FORMS_ACCESS_KEY = 'REPLACE_WITH_YOUR_WEB3FORMS_KEY';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function ContactPage() {
  const [status, setStatus] = useState<Status>('idle');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');
    const form = new FormData(event.currentTarget);
    form.append('access_key', WEB3FORMS_ACCESS_KEY);
    form.append('from_name', 'chess-cheat-detection contact');
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: form,
      });
      const json = (await res.json()) as { success: boolean };
      setStatus(json.success ? 'sent' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <article className="contact">
        <h1>Thanks</h1>
        <p className="muted">Your message is on its way. I'll get back to you by email.</p>
        <p>
          <a href="/">← back to the analyzer</a>
        </p>
      </article>
    );
  }

  return (
    <article className="contact">
      <h1>Contact</h1>
      <p className="muted">
        Found a bug, have a feature idea, or think a report got something wrong? Send a note.
      </p>

      <form onSubmit={onSubmit} className="contact-form">
        <label>
          Your email
          <input type="email" name="email" required placeholder="you@example.com" />
        </label>
        <label>
          Subject
          <input type="text" name="subject" required placeholder="what's this about?" />
        </label>
        <label>
          Message
          <textarea name="message" required rows={6} placeholder="your message" />
        </label>
        <button type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? 'sending…' : 'send'}
        </button>
        {status === 'error' && (
          <p className="error">Something went wrong. Please try again in a moment.</p>
        )}
      </form>

      <p className="muted small">
        <a href="/">← back to the analyzer</a>
      </p>
    </article>
  );
}
