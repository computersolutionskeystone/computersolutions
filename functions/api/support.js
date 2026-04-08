export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const formData = await request.formData();
    const name = formData.get('name') || '';
    const phone = formData.get('phone') || '';
    const device = formData.get('device') || '';
    const issue = formData.get('issue') || '';

    // Upload images to R2 if available
    var imageUrls = [];
    if (env.SUPPORT_BUCKET) {
      const files = formData.getAll('photos');
      for (const file of files) {
        if (!file || !file.size || file.size === 0) continue;
        if (file.size > 5 * 1024 * 1024) continue; // skip >5MB

        const ext = file.name.split('.').pop() || 'jpg';
        const key = `support/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        await env.SUPPORT_BUCKET.put(key, file.stream(), {
          httpMetadata: { contentType: file.type },
        });

        // Build public URL — requires R2 custom domain or public access
        const publicUrl = env.R2_PUBLIC_URL
          ? `${env.R2_PUBLIC_URL}/${key}`
          : `(uploaded: ${key})`;
        imageUrls.push(publicUrl);
      }
    }

    // Build email body
    let body = `Customer Support Request\n\n`;
    body += `Name: ${name}\n`;
    body += `Phone: ${phone}\n`;
    body += `Device: ${device}\n\n`;
    body += `Issue:\n${issue}\n`;

    if (imageUrls.length > 0) {
      body += `\n\nPhotos (${imageUrls.length}):\n`;
      imageUrls.forEach((url, i) => {
        body += `${i + 1}. ${url}\n`;
      });
    }

    // Send via Web3Forms
    const web3Key = env.WEB3FORMS_KEY || formData.get('access_key') || '';

    const emailRes = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_key: web3Key,
        subject: 'Customer Support Request - Computer Solutions',
        from_name: 'Computer Solutions Support',
        name,
        phone,
        device,
        issue,
        photos: imageUrls.length > 0 ? imageUrls.join('\n') : 'No photos attached',
        message: body,
      }),
    });

    if (!emailRes.ok) {
      return new Response(JSON.stringify({ success: false, error: 'Email send failed' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, images: imageUrls.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
