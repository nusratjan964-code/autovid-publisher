import {
  setActivePageId,
  getActivePageSanitized,
  getSanitizedPages,
  getPageAccessToken
} from './credentials.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { pageId } = req.body || {};

  if (!pageId) {
    return res.status(400).json({
      success: false,
      error: 'pageId is required',
      message: 'অনুগ্রহ করে একটি বৈধ Facebook Page নির্বাচন করুন।'
    });
  }

  const pages = getSanitizedPages();
  const selectedPage = pages.find(p => p.id === String(pageId).trim());

  if (!selectedPage) {
    return res.status(404).json({
      success: false,
      error: 'Page not found in discovered list',
      message: `ID "${pageId}" পেজটি আবিষ্কৃত পেজের তালিকায় পাওয়া যায়নি। পুনরায় টোকেন ভেরিফাই করুন।`
    });
  }

  setActivePageId(selectedPage.id);
  const token = selectedPage.accessToken || getPageAccessToken(selectedPage.id) || '';

  return res.status(200).json({
    success: true,
    page: selectedPage,
    token,
    message: `✅ "${selectedPage.name}" (ID: ${selectedPage.id}) সক্রিয় পেজ হিসেবে সেট করা হয়েছে!`
  });
}
