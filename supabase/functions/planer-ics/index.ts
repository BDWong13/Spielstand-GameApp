// Kalender-Abo für den Planer: liefert Deadlines (⚑), Zeitblöcke (▶) und eigene Termine als .ics.
// Aufruf: GET /functions/v1/planer-ics?token=<geheimer Link aus der App>
// Der Kalender ersetzt bei jeder Aktualisierung den kompletten Inhalt, deshalb gibt es keine Dubletten.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s: string, n: number) => {
  const [y, m, d] = s.split('-').map(Number);
  return isoDay(new Date(y, m - 1, d + n));
};
const toMin = (s: string) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const fromMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const esc = (x: string) => String(x).replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => '\\' + m).replace(/\r?\n/g, '\\n');
const dt = (date: string, time: string) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
const allDay = (from: string, to: string) =>
  `DTSTART;VALUE=DATE:${from.replace(/-/g, '')}\r\nDTEND;VALUE=DATE:${addDays(to, 1).replace(/-/g, '')}`;
// Lange Zeilen nach RFC 5545 falten (75 Bytes)
const fold = (line: string) => {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = []; let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
};
const RR: Record<string, string> = {
  daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY',
};

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token') || '';
  if (token.length < 24) return new Response('Not found', { status: 404 });
  const { data: feed } = await sb.from('planer_feeds').select('user_id').eq('token', token).maybeSingle();
  if (!feed) return new Response('Not found', { status: 404 });

  const { data: rows, error } = await sb.from('planer_items').select('kind,id,data')
    .eq('user_id', feed.user_id).eq('deleted', false).in('kind', ['task', 'event', 'project']);
  if (error) return new Response('Fehler', { status: 500 });

  const projects = new Map(rows!.filter((r) => r.kind === 'project').map((r) => [r.id, r.data.name]));
  const today = isoDay(new Date(Date.now() + 60 * 60 * 1000)); // grob Mitteleuropa
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev: string[] = [];
  const push = (uid: string, summary: string, when: string, desc = '', extra = '') =>
    ev.push(['BEGIN:VEVENT', `UID:${uid}@planer`, `DTSTAMP:${stamp}`, when, `SUMMARY:${esc(summary)}`,
      ...(desc ? [`DESCRIPTION:${esc(desc)}`] : []), ...(extra ? [extra] : []), 'END:VEVENT'].join('\r\n'));

  for (const r of rows!) {
    const d = r.data || {};
    if (r.kind === 'task' && !d.done) {
      if (d.due && d.due >= addDays(today, -14)) {
        const desc = [projects.get(d.project) && `Projekt: ${projects.get(d.project)}`,
          d.status === 'waiting' && `Warten auf: ${d.waitingFor}`, d.notes].filter(Boolean).join('\n');
        push(`${r.id}-due`, `⚑ ${d.title}`, d.dueTime ? `DTSTART:${dt(d.due, d.dueTime)}\r\nDURATION:PT30M` : allDay(d.due, d.due), desc, 'TRANSP:TRANSPARENT');
      }
      if (d.status !== 'waiting' && d.plan && d.planTime && d.plan >= addDays(today, -14)) {
        push(`${r.id}-block`, `▶ ${d.title}`, `DTSTART:${dt(d.plan, d.planTime)}\r\nDURATION:PT${+d.est || 30}M`, d.notes || '');
      }
    }
    if (r.kind === 'event' && !d.source && d.date) {
      const when = d.allDay ? allDay(d.date, d.endDate || d.date)
        : `DTSTART:${dt(d.date, d.start || '09:00')}\r\nDTEND:${dt(d.endDate || d.date, d.end || fromMin(Math.min(1439, toMin(d.start) + 60)))}`;
      const extra = [d.location && `LOCATION:${esc(d.location)}`, d.repeat && RR[d.repeat] && `RRULE:${RR[d.repeat]}`].filter(Boolean).join('\r\n');
      push(r.id, d.title, when, d.notes || '', extra);
    }
  }

  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Planer//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Planer', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H', ...ev, 'END:VCALENDAR']
    .join('\r\n').split('\r\n').map(fold).join('\r\n') + '\r\n';
  return new Response(body, {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' },
  });
});
