import { getQueueState, updateQueueItem } from './queue.js';
import publishHandler from './facebook/publish.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  // Verify CRON_SECRET if configured
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ success: false, error: 'Unauthorized Cron Trigger' });
    }
  }

  const state = getQueueState();
  const now = new Date();
  
  // Find pending items whose scheduled time has arrived
  const dueItems = state.items.filter(item => {
    if (item.status !== 'Pending') return false;
    const schedDate = new Date(item.scheduledDate);
    return schedDate <= now;
  });

  console.log(`[Cron Scheduler] Running automatic publishing check. Found ${dueItems.length} due items out of ${state.items.length} total.`);

  const results = [];

  for (const item of dueItems) {
    console.log(`[Cron Scheduler] Processing due post: "${item.title}" (ID: ${item.id})...`);
    
    // Transition to Processing
    updateQueueItem(item.id, { status: 'Processing' });

    // Mock req & res to invoke publish handler directly
    const mockReq = {
      method: 'POST',
      body: {
        pageId: item.pageId || process.env.FB_PAGE_ID || null,
        message: item.caption,
        videoUrl: item.videoUrl,
        postType: item.videoUrl ? 'video' : 'text',
        idempotencyKey: item.idempotencyKey,
        itemId: item.id
      },
      headers: {}
    };

    let responseData = null;
    let responseStatus = 200;

    const mockRes = {
      setHeader: () => {},
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => {
            responseData = data;
          }
        };
      }
    };

    try {
      await publishHandler(mockReq, mockRes);
      results.push({
        id: item.id,
        title: item.title,
        status: responseData?.status || (responseStatus === 200 ? 'Published' : 'Failed'),
        postId: responseData?.postId || null,
        error: responseData?.error || null
      });
    } catch (e) {
      updateQueueItem(item.id, { status: 'Failed', error: e.message });
      results.push({
        id: item.id,
        title: item.title,
        status: 'Failed',
        error: e.message
      });
    }
  }

  return res.status(200).json({
    success: true,
    triggeredAt: now.toISOString(),
    dueCount: dueItems.length,
    processed: results
  });
}
