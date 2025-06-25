import axios from 'axios';
import cron  from 'node-cron';
import twilio from 'twilio';

const tw  = twilio(process.env.TWILIO_ACCOUNT_SID,
                  process.env.TWILIO_AUTH_TOKEN);
const svc = process.env.SYNC_SERVICE_SID || 'default';
const list= 'openaiJobs';
const fromSandbox = 'whatsapp:+14155238886';   // Twilio sandbox

async function processItem(item) {
  const { from, text } = item.data;

  const rsp = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-search-preview-2025-03-11',
      messages: [
        { role: 'system', content: process.env.SYSTEM_PROMPT },
        { role: 'user',   content: text }
      ],
      web_search_options: {
        search_context_size: 'low',
        user_location: {
          type: 'approximate',
          approximate: { country: 'IL' }
        }
      }
    },
    { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      timeout: 60000 }
  );

  const answer = rsp.data.choices[0].message.content;

  await tw.messages.create({
    from: fromSandbox,
    to:   from,
    body: answer
  });

  await tw.sync.services(svc)
          .syncLists(list)
          .syncListItems(item.index)
          .remove();
}

async function poll() {
  const items = await tw.sync.services(svc)
                     .syncLists(list)
                     .syncListItems
                     .list({ limit: 10 });
  for (const it of items) {
    try { await processItem(it); }
    catch(e){ console.error('Job failed:', e); }
  }
}

cron.schedule('* * * * *', poll);
console.log('Worker up — polling every minute…');
