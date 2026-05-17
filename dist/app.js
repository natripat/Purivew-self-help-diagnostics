// ==================== ACCESS CONTROL ====================

// ✏️ TO UPDATE ACCESS: Add or remove aliases/emails below, then redeploy
const ALLOWED_USERS = ['natripat', 'kchopra']; // Add aliases or full emails here
const ADMIN_USERS = ['natripat', 'kchopra']; // Only these users see Tester & PG Review portals
let isAdmin = false; // Set during validateAccess()

// ==================== AI CONFIGURATION ====================

function getAIConfig() {
  return JSON.parse(localStorage.getItem('purview-ai-config') || '{}');
}

function saveAIConfig(endpoint, key, deployment) {
  localStorage.setItem('purview-ai-config', JSON.stringify({ endpoint, key, deployment }));
  alert('✅ AI configuration saved!');
}

async function aiSummarize(title, notes, status) {
  const config = getAIConfig();
  if (!config.endpoint || !config.key || !config.deployment) {
    return null; // No AI config, skip
  }

  const prompt = `You are a QA feedback analyst for Microsoft Purview Self-Help Diagnostics. Based on the tester's findings below, provide:
1. A concise, professional title (max 15 words) that clearly describes the issue or finding for the Product Group
2. A 2-3 sentence executive summary of what was tested, what happened, and the impact

Scenario Title: ${title}
Test Result: ${status}
Tester Notes: ${notes || 'No notes provided'}

Respond in JSON format: {"title": "...", "summary": "..."}`;

  try {
    const url = `${config.endpoint.replace(/\/$/,'')}/openai/deployments/${config.deployment}/chat/completions?api-version=2024-02-01`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': config.key },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 200 })
    });
    if (!res.ok) throw new Error('AI API returned ' + res.status);
    const data = await res.json();
    const content = data.choices[0].message.content.trim();
    // Parse JSON from response (handle markdown code blocks)
    const jsonStr = content.replace(/```json\n?/g,'').replace(/```/g,'').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.warn('AI summarization failed:', e);
    return null;
  }
}

async function aiSuggestInline(id, type) {
  const config = getAIConfig();
  if (!config.endpoint || !config.key || !config.deployment) {
    alert('⚙️ Please configure AI settings first (gear icon in header)');
    return;
  }

  let title, notes, status, targetDiv;
  if (type === 'custom') {
    title = document.getElementById('custom-title-'+id)?.value || '';
    notes = document.getElementById('custom-notes-'+id)?.value || '';
    status = document.getElementById('custom-status-'+id)?.value || 'not-tested';
    targetDiv = document.getElementById('ai-suggestion-custom-'+id);
  } else {
    title = testPlans.find(t => t.id === id)?.title || '';
    notes = document.getElementById('ev-notes-'+id)?.value || '';
    status = document.getElementById('ev-status-'+id)?.value || 'not-tested';
    targetDiv = document.getElementById('ai-suggestion-'+id);
  }

  if (!notes.trim() && !title.trim()) { alert('Please enter a title or observations first.'); return; }

  targetDiv.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--text-muted);background:var(--surface-hover);border-radius:6px;border:1px solid var(--border)">🤖 Thinking...</div>';

  const ai = await aiSummarize(title, notes, status);
  if (!ai) {
    targetDiv.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--danger);background:#3a1a1a;border-radius:6px;border:1px solid var(--danger)">❌ AI suggestion failed. Check your AI settings.</div>';
    return;
  }

  targetDiv.innerHTML = `
    <div style="background:linear-gradient(135deg,rgba(139,92,246,.1),rgba(98,100,167,.1));border:1px solid #8b5cf6;border-radius:8px;padding:14px;margin-top:8px">
      <div style="font-size:11px;color:#8b5cf6;font-weight:600;margin-bottom:8px">🤖 AI SUGGESTION</div>
      <div style="margin-bottom:8px">
        <span style="font-size:11px;color:var(--text-muted)">Suggested Title:</span>
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-top:2px">${ai.title}</div>
      </div>
      <div style="margin-bottom:10px">
        <span style="font-size:11px;color:var(--text-muted)">Summary:</span>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;line-height:1.5">${ai.summary}</div>
      </div>
      <button onclick="applyAISuggestion('${id}','${type}',this)" data-title="${ai.title.replace(/"/g,'&quot;')}" data-summary="${ai.summary.replace(/"/g,'&quot;')}" style="background:#8b5cf6;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11px">✅ Apply Title</button>
      <button onclick="this.parentElement.remove()" style="background:none;border:1px solid var(--border);color:var(--text-muted);padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11px;margin-left:6px">✖ Dismiss</button>
    </div>`;
}

function applyAISuggestion(id, type, btn) {
  const title = btn.getAttribute('data-title');
  if (type === 'custom') {
    const titleEl = document.getElementById('custom-title-'+id);
    if (titleEl) titleEl.value = title;
  }
  // For predefined scenarios, we store the AI title in localStorage for report use
  if (type === 'predefined') {
    const existing = JSON.parse(localStorage.getItem('pg-evidence-'+id) || '{}');
    existing.aiTitle = title;
    existing.aiSummary = btn.getAttribute('data-summary');
    localStorage.setItem('pg-evidence-'+id, JSON.stringify(existing));
  }
  btn.parentElement.innerHTML = '<div style="font-size:11px;color:#4caf50;padding:4px">✅ Applied!</div>';
}

function showAISettings() {
  const config = getAIConfig();
  const modal = document.createElement('div');
  modal.id = 'ai-settings-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9999';
  modal.innerHTML = `
    <div style="background:var(--surface,#1e1e2e);border:1px solid var(--border,#333);border-radius:12px;padding:28px;max-width:500px;width:90%;color:var(--text,#e0e0e0)">
      <h3 style="margin:0 0 8px;font-size:16px">⚙️ AI Configuration</h3>
      <p style="font-size:12px;color:var(--text-muted,#888);margin-bottom:16px">Connect Azure OpenAI to enable AI-powered report summaries and title improvements.</p>
      <div style="margin-bottom:12px">
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Azure OpenAI Endpoint:</label>
        <input type="text" id="ai-endpoint" value="${config.endpoint||''}" placeholder="https://your-resource.openai.azure.com" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border,#333);background:var(--bg,#111);color:var(--text,#e0e0e0);font-size:12px;box-sizing:border-box">
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">API Key:</label>
        <input type="password" id="ai-key" value="${config.key||''}" placeholder="your-api-key" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border,#333);background:var(--bg,#111);color:var(--text,#e0e0e0);font-size:12px;box-sizing:border-box">
      </div>
      <div style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Deployment Name:</label>
        <input type="text" id="ai-deployment" value="${config.deployment||''}" placeholder="gpt-4o or your deployment name" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border,#333);background:var(--bg,#111);color:var(--text,#e0e0e0);font-size:12px;box-sizing:border-box">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="document.getElementById('ai-settings-modal').remove()" style="background:var(--surface-hover,#333);color:var(--text,#e0e0e0);border:1px solid var(--border,#444);padding:8px 16px;border-radius:6px;cursor:pointer;font-size:12px">Cancel</button>
        <button onclick="saveAIConfig(document.getElementById('ai-endpoint').value,document.getElementById('ai-key').value,document.getElementById('ai-deployment').value);document.getElementById('ai-settings-modal').remove()" style="background:#0078d4;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:12px">💾 Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
}

async function validateAccess() {
  try {
    const res = await fetch('/.auth/me');
    const data = await res.json();
    const clientPrincipal = data.clientPrincipal;
    if (!clientPrincipal) {
      showAccessDenied('Not authenticated. Please sign in.');
      return false;
    }
    const userDetail = (clientPrincipal.userDetails || '').toLowerCase();
    const userId = (clientPrincipal.userId || '').toLowerCase();
    // Check if alias matches (before @) or full email matches
    // Azure AD Free tier may mask emails (e.g., "kch*****@microsoft.com")
    const alias = userDetail.includes('@') ? userDetail.split('@')[0] : userDetail;
    const unmaskedAlias = alias.replace(/\*+/g, ''); // strip mask chars
    const matchUser = (list) => list.some(a => {
      const al = a.toLowerCase();
      return al === alias || al === userDetail || alias.startsWith(al.substring(0,3)) || al.startsWith(unmaskedAlias);
    });
    if (matchUser(ALLOWED_USERS)) {
      isAdmin = matchUser(ADMIN_USERS);
      document.getElementById('home-page').style.display = 'block';
      document.getElementById('access-gate').style.display = 'none';
      applyAdminVisibility();
      return true;
    }
    showAccessDenied(`Access denied for "${userDetail}". Contact natripat to request access.`);
    return false;
  } catch (e) {
    // If auth endpoint unavailable (local dev), treat as admin
    isAdmin = true;
    document.getElementById('home-page').style.display = 'block';
    document.getElementById('access-gate').style.display = 'none';
    applyAdminVisibility();
    return true;
  }
}

function applyAdminVisibility() {
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });
}

function showAccessDenied(msg) {
  document.querySelector('.app').style.display = 'none';
  const gate = document.getElementById('access-gate');
  gate.style.display = 'flex';
  gate.innerHTML = `
    <div style="text-align:center;max-width:400px;">
      <div style="font-size:64px;margin-bottom:16px;">🚫</div>
      <h2 style="margin-bottom:12px;color:var(--danger,#d13438);">Access Denied</h2>
      <p style="color:var(--text-secondary,#616161);margin-bottom:24px;">${msg}</p>
      <a href="/.auth/logout" style="color:var(--primary,#0078d4);text-decoration:underline;">Sign out and try another account</a>
    </div>`;
}

// ==================== HOME & VIEW SWITCHING ====================

function goHome() {
  document.querySelector('.app').style.display = 'none';
  document.getElementById('pg-view').style.display = 'none';
  document.getElementById('diagnostics-view').style.display = 'none';
  document.getElementById('home-page').style.display = 'block';
}

function enterTesterView() {
  document.getElementById('home-page').style.display = 'none';
  document.getElementById('pg-view').style.display = 'none';
  document.getElementById('diagnostics-view').style.display = 'none';
  document.querySelector('.app').style.display = 'grid';
}

function enterPGView() {
  document.getElementById('home-page').style.display = 'none';
  document.querySelector('.app').style.display = 'none';
  document.getElementById('diagnostics-view').style.display = 'none';
  document.getElementById('pg-view').style.display = 'block';
  renderPGView();
}

// ==================== DIAGNOSTICS VIEW ====================

function enterDiagnosticsView() {
  document.getElementById('home-page').style.display = 'none';
  document.querySelector('.app').style.display = 'none';
  document.getElementById('pg-view').style.display = 'none';
  document.getElementById('diagnostics-view').style.display = 'block';
  showDiagnosticsProducts();
}

const diagnosticCards = {
  dlp: [
    { id: 'diag-dlp-1', name: "A DLP rule isn't enforced for a specific user", description: "Check which policies are applied to the user, including policy names and where they apply.", icon: '🛡️' },
    { id: 'diag-dlp-2', name: "Endpoint DLP not working?", description: "We'll check for policy sync issues and recommendations on how to resolve them.", icon: '💻' },
    { id: 'diag-dlp-3', name: "Alerts not working for a DLP rule", description: "Search for alerts and determine if there are any issues with how the Data Loss Prevention rule is set up.", icon: '🔔' },
    { id: 'diag-dlp-4', name: "Can't find an alert for an activity or an audit event", description: "Find the alert for an activity or audited event, or figure out why the alert could be missing.", icon: '🔍' },
    { id: 'diag-dlp-5', name: "Analyze whether DLP matches a SharePoint or OneDrive file", description: "Check a file's properties and classification to review whether DLP matched or didn't match.", icon: '📄' },
    { id: 'diag-dlp-6', name: "Policy tips not displaying in Outlook on the web", description: "We'll analyze the HAR file to investigate why policy tips aren't displaying in Outlook on the web.", icon: '💡' },
    { id: 'diag-dlp-7', name: "Analyze the message trace log for Exchange DLP", description: "Upload the message trace log (.csv) to review how DLP rules were applied to email messages.", icon: '📧' }
  ],
  ip: [
    { id: 'diag-ip-1', name: "Email encryption isn't working as expected", description: "Checks license availability for sensitivity labels, IRM settings, transport rules, and encryption settings.", icon: '🔒' },
    { id: 'diag-ip-2', name: "User can't find a sensitivity label", description: "Checks which labels are available to the user, label names, settings, and availability.", icon: '🏷️' },
    { id: 'diag-ip-3', name: "Auto-labeling not applied to a SharePoint or OneDrive file", description: "Checks file properties, classification, and whether auto-labeling conditions were met.", icon: '📎' }
  ]
};

function showDiagnosticsProducts() {
  const container = document.getElementById('diagnostics-content');
  container.innerHTML = `
    <div style="text-align:center;margin-bottom:40px">
      <h2 style="font-size:22px;color:var(--text);margin-bottom:8px">Choose a Product Area</h2>
      <p style="font-size:14px;color:var(--text-secondary)">Select the area to see available diagnostics you can test</p>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;max-width:800px;margin:0 auto">
      <!-- DLP -->
      <div onclick="showDiagnosticCards('dlp')" style="cursor:pointer;background:var(--surface);border:2px solid var(--border);border-radius:14px;padding:32px 28px;transition:all .2s ease;box-shadow:var(--shadow-sm)" onmouseover="this.style.borderColor='#107c10';this.style.transform='translateY(-3px)';this.style.boxShadow='0 6px 20px rgba(16,124,16,.15)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform='none';this.style.boxShadow='var(--shadow-sm)'">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
          <div style="width:48px;height:48px;background:#0d3320;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px">🛡️</div>
          <div>
            <h3 style="font-size:17px;color:var(--text)">Data Loss Prevention</h3>
            <p style="font-size:12px;color:var(--text-muted)">7 diagnostics available</p>
          </div>
        </div>
        <p style="font-size:13px;color:var(--text-secondary);line-height:1.5">Policy enforcement, endpoint sync, alerts, file analysis, policy tips, message trace</p>
      </div>

      <!-- Information Protection -->
      <div onclick="showDiagnosticCards('ip')" style="cursor:pointer;background:var(--surface);border:2px solid var(--border);border-radius:14px;padding:32px 28px;transition:all .2s ease;box-shadow:var(--shadow-sm)" onmouseover="this.style.borderColor='#0078d4';this.style.transform='translateY(-3px)';this.style.boxShadow='0 6px 20px rgba(0,120,212,.15)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform='none';this.style.boxShadow='var(--shadow-sm)'">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
          <div style="width:48px;height:48px;background:#1a2a4a;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px">🏷️</div>
          <div>
            <h3 style="font-size:17px;color:var(--text)">Information Protection</h3>
            <p style="font-size:12px;color:var(--text-muted)">3 diagnostics available</p>
          </div>
        </div>
        <p style="font-size:13px;color:var(--text-secondary);line-height:1.5">Encryption settings, sensitivity label policy, auto-labeling file check</p>
      </div>
    </div>

    <!-- Previously submitted feedback -->
    ${renderDiagnosticsFeedbackSummary()}
  `;
}

function renderDiagnosticsFeedbackSummary() {
  const feedback = JSON.parse(localStorage.getItem('purview-diag-feedback') || '[]');
  if (feedback.length === 0) return '';
  return `
    <div style="margin-top:40px;max-width:800px;margin-left:auto;margin-right:auto">
      <h3 style="font-size:15px;color:var(--text-secondary);margin-bottom:12px">📋 Your Recent Submissions (${feedback.length})</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${feedback.slice(0, 5).map((f, i) => {
          const icon = f.status==='pass'?'✅':f.status==='fail'?'❌':f.status==='partial'?'⚠️':'⬜';
          return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px">
            <span>${icon}</span>
            <span style="flex:1;font-size:13px;color:var(--text)">${f.diagnosticName}</span>
            <span style="font-size:11px;color:var(--text-muted)">${new Date(f.timestamp).toLocaleDateString()}</span>
            <button onclick="deleteDiagFeedback(${i})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:12px" title="Delete">🗑️</button>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function deleteDiagFeedback(idx) {
  if (!confirm('Delete this feedback entry?')) return;
  const feedback = JSON.parse(localStorage.getItem('purview-diag-feedback') || '[]');
  feedback.splice(idx, 1);
  localStorage.setItem('purview-diag-feedback', JSON.stringify(feedback));
  showDiagnosticsProducts();
}

function showDiagnosticCards(area) {
  const cards = diagnosticCards[area];
  const areaTitle = area === 'dlp' ? 'Data Loss Prevention' : 'Information Protection';
  const areaColor = area === 'dlp' ? '#107c10' : '#0078d4';
  const container = document.getElementById('diagnostics-content');

  container.innerHTML = `
    <button onclick="showDiagnosticsProducts()" style="background:var(--surface);border:1px solid var(--border);color:var(--text);padding:6px 16px;border-radius:20px;cursor:pointer;font-size:12px;margin-bottom:24px">← Back to Product Areas</button>

    <div style="margin-bottom:28px">
      <h2 style="font-size:20px;color:var(--text);margin-bottom:6px">Diagnostics — ${areaTitle}</h2>
      <p style="font-size:13px;color:var(--text-secondary)">Choose the scenario that best describes your problem and then run a diagnostic assessment.</p>
      <a href="https://learn.microsoft.com/en-ca/troubleshoot/microsoft-365/purview/diagnostics/purview-compliance-diagnostics" target="_blank" style="font-size:12px;color:var(--primary);text-decoration:none">Learn more about diagnostics ↗</a>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      ${cards.map(card => {
        const saved = JSON.parse(localStorage.getItem('purview-diag-feedback') || '[]');
        const hasFeedback = saved.some(f => f.diagnosticId === card.id);
        return `
        <div onclick="openDiagnosticFeedback('${card.id}','${area}')" style="cursor:pointer;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;transition:all .2s ease;position:relative" onmouseover="this.style.borderColor='${areaColor}';this.style.boxShadow='0 4px 16px rgba(0,0,0,.1)'" onmouseout="this.style.borderColor='var(--border)';this.style.boxShadow='none'">
          ${hasFeedback ? '<div style="position:absolute;top:12px;right:12px;background:#0d3320;color:#4caf50;padding:2px 8px;border-radius:10px;font-size:10px">✅ Submitted</div>' : ''}
          <h3 style="font-size:14px;color:var(--text);margin-bottom:10px;padding-right:${hasFeedback?'70px':'0'}">${card.name}</h3>
          <p style="font-size:12px;color:var(--text-secondary);line-height:1.5">${card.description}</p>
        </div>`;
      }).join('')}
    </div>
  `;
}

function openDiagnosticFeedback(diagId, area) {
  const allCards = [...diagnosticCards.dlp, ...diagnosticCards.ip];
  const card = allCards.find(c => c.id === diagId);
  if (!card) return;

  const areaColor = area === 'dlp' ? '#107c10' : '#0078d4';
  const container = document.getElementById('diagnostics-content');

  // Load existing draft
  const draft = JSON.parse(localStorage.getItem('purview-diag-draft-'+diagId) || '{}');

  container.innerHTML = `
    <button onclick="showDiagnosticCards('${area}')" style="background:var(--surface);border:1px solid var(--border);color:var(--text);padding:6px 16px;border-radius:20px;cursor:pointer;font-size:12px;margin-bottom:24px">← Back to Diagnostics</button>

    <div style="border-left:4px solid ${areaColor};padding-left:16px;margin-bottom:28px">
      <h2 style="font-size:18px;color:var(--text);margin-bottom:4px">${card.name}</h2>
      <p style="font-size:13px;color:var(--text-secondary)">${card.description}</p>
    </div>

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px">
      <h3 style="font-size:15px;color:var(--text);margin-bottom:20px">📝 Submit Your Feedback</h3>

      <div style="margin-bottom:16px">
        <label style="font-size:13px;font-weight:600;color:var(--text);display:block;margin-bottom:6px">Test Result:</label>
        <select id="diag-fb-status-${diagId}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;min-width:200px">
          <option value="not-tested" ${(draft.status||'')==='not-tested'?'selected':''}>⬜ Not Tested</option>
          <option value="pass" ${(draft.status||'')==='pass'?'selected':''}>✅ Pass — Working as expected</option>
          <option value="partial" ${(draft.status||'')==='partial'?'selected':''}>⚠️ Partial — Works but has issues</option>
          <option value="fail" ${(draft.status||'')==='fail'?'selected':''}>❌ Fail — Not working correctly</option>
        </select>
      </div>

      <div style="margin-bottom:16px">
        <label style="font-size:13px;font-weight:600;color:var(--text);display:block;margin-bottom:6px">What did you test & what happened?</label>
        <textarea id="diag-fb-notes-${diagId}" style="width:100%;min-height:120px;padding:12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box" placeholder="Describe:\n• What steps you took to test this diagnostic\n• What result you got\n• What you expected to happen\n• Any issues or observations">${draft.notes||''}</textarea>
      </div>

      <div style="margin-bottom:16px">
        <label style="font-size:13px;font-weight:600;color:var(--text);display:block;margin-bottom:6px">📎 Attach Evidence (optional):</label>
        <input type="file" id="diag-fb-files-${diagId}" multiple accept="image/*,.html,.txt,.log,.csv,.har,.mp4,.webm" style="font-size:12px;color:var(--text)">
        <p style="font-size:11px;color:var(--text-muted);margin-top:4px">Screenshots, screen recordings, HAR files, logs</p>
        <div id="diag-fb-preview-${diagId}" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px"></div>
      </div>

      <div style="margin-bottom:16px">
        <label style="font-size:13px;font-weight:600;color:var(--text);display:block;margin-bottom:6px">Severity:</label>
        <select id="diag-fb-severity-${diagId}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px">
          <option value="low" ${(draft.severity||'')==='low'?'selected':''}>Low — Minor issue</option>
          <option value="medium" ${(draft.severity||'medium')==='medium'?'selected':''}>Medium — Noticeable problem</option>
          <option value="high" ${(draft.severity||'')==='high'?'selected':''}>High — Significant issue</option>
          <option value="critical" ${(draft.severity||'')==='critical'?'selected':''}>Critical — Completely broken</option>
        </select>
      </div>

      <div style="display:flex;gap:12px;align-items:center;margin-top:24px">
        <button onclick="submitDiagnosticFeedback('${diagId}','${area}')" style="background:linear-gradient(135deg,#107c10,#0d6e0d);color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">📤 Submit Feedback</button>
        <button onclick="saveDiagnosticDraft('${diagId}')" style="background:var(--surface-hover);color:var(--text);border:1px solid var(--border);padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13px">💾 Save Draft</button>
        <span id="diag-fb-msg-${diagId}" style="font-size:12px;color:var(--text-muted)"></span>
      </div>
    </div>
  `;
}

function saveDiagnosticDraft(diagId) {
  const status = document.getElementById('diag-fb-status-'+diagId)?.value || 'not-tested';
  const notes = document.getElementById('diag-fb-notes-'+diagId)?.value || '';
  const severity = document.getElementById('diag-fb-severity-'+diagId)?.value || 'medium';
  localStorage.setItem('purview-diag-draft-'+diagId, JSON.stringify({ status, notes, severity }));
  const msg = document.getElementById('diag-fb-msg-'+diagId);
  if (msg) { msg.textContent = '✅ Draft saved!'; setTimeout(() => msg.textContent = '', 2000); }
}

async function submitDiagnosticFeedback(diagId, area) {
  const allCards = [...diagnosticCards.dlp, ...diagnosticCards.ip];
  const card = allCards.find(c => c.id === diagId);
  if (!card) return;

  const status = document.getElementById('diag-fb-status-'+diagId)?.value || 'not-tested';
  const notes = document.getElementById('diag-fb-notes-'+diagId)?.value || '';
  const severity = document.getElementById('diag-fb-severity-'+diagId)?.value || 'medium';

  if (!notes.trim()) { alert('Please describe what you tested and what happened.'); return; }

  // Collect files
  const fileInput = document.getElementById('diag-fb-files-'+diagId);
  const files = [];
  if (fileInput && fileInput.files.length > 0) {
    await Promise.all(Array.from(fileInput.files).map(file => new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => { files.push({ name: file.name, type: file.type, size: file.size, data: reader.result }); resolve(); };
      reader.readAsDataURL(file);
    })));
  }

  // Save locally
  const feedback = JSON.parse(localStorage.getItem('purview-diag-feedback') || '[]');
  const entry = {
    diagnosticId: diagId,
    diagnosticName: card.name,
    area: area,
    status,
    notes,
    severity,
    files,
    timestamp: new Date().toISOString()
  };
  feedback.unshift(entry);
  localStorage.setItem('purview-diag-feedback', JSON.stringify(feedback));

  // Clear draft
  localStorage.removeItem('purview-diag-draft-'+diagId);

  // Try to submit to API
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: area === 'dlp' ? 'Data Loss Prevention' : 'Information Protection',
        description: notes.substring(0, 5000),
        diagnosticName: card.name,
        severity: severity,
        area: area,
        testResult: status,
        notes: notes.substring(0, 2000)
      })
    });
    if (res.ok) {
      alert('✅ Feedback submitted successfully! Thank you for testing.');
    } else {
      alert('✅ Feedback saved locally. (API submission will sync later)');
    }
  } catch (e) {
    alert('✅ Feedback saved locally. (API unavailable — will sync when connected)');
  }

  // Go back to cards view
  showDiagnosticCards(area);
}

// ==================== FEEDBACK REPORT VIEW ====================
function enterFeedbackReportView() {
  document.getElementById('home-page').style.display = 'none';
  document.getElementById('feedback-report-view').style.display = 'block';
  refreshFeedbackReport();
}

function leaveFeedbackReportView() {
  document.getElementById('feedback-report-view').style.display = 'none';
  document.getElementById('home-page').style.display = '';
}

async function refreshFeedbackReport() {
  const container = document.getElementById('feedback-report-content');
  container.innerHTML = '<div style="text-align:center;padding:60px"><div style="font-size:36px;margin-bottom:12px">⏳</div><p style="color:var(--text-secondary)">Loading feedback from server...</p></div>';

  let apiFeedback = [];
  let apiError = null;

  try {
    const res = await fetch('/api/feedback');
    if (res.ok) {
      apiFeedback = await res.json();
    } else {
      apiError = `API returned ${res.status}`;
    }
  } catch (e) {
    apiError = e.message;
  }

  // Also include local feedback
  const localFeedback = JSON.parse(localStorage.getItem('purview-diag-feedback') || '[]').map(f => ({
    diagnosticName: f.diagnosticName || '',
    area: f.area || '',
    testResult: f.status || '',
    severity: f.severity || 'medium',
    description: f.notes || '',
    notes: f.notes || '',
    submittedBy: 'You (local)',
    createdAt: f.timestamp || '',
    source: 'local'
  }));

  // Mark API feedback
  apiFeedback = apiFeedback.map(f => ({ ...f, source: 'cloud' }));

  // Merge, deduplicate by matching diagnosticName + notes + close timestamps
  const allFeedback = [...apiFeedback, ...localFeedback];
  
  // Sort by date, newest first
  allFeedback.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  // Stats
  const cloudCount = apiFeedback.length;
  const localCount = localFeedback.length;
  const totalCount = allFeedback.length;
  
  const statusCounts = {};
  allFeedback.forEach(f => {
    const s = f.testResult || f.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  const statusBadges = {
    'working': { color: '#4caf50', bg: '#0d3320', label: '✅ Working' },
    'partially-working': { color: '#ff9800', bg: '#3d2800', label: '⚠️ Partial' },
    'not-working': { color: '#f44336', bg: '#3d0a0a', label: '❌ Not Working' },
    'not-tested': { color: '#9e9e9e', bg: '#2a2a2a', label: '⏸️ Not Tested' },
    'unknown': { color: '#9e9e9e', bg: '#2a2a2a', label: '❓ Unknown' }
  };

  let html = '';

  // Error banner if API failed
  if (apiError) {
    html += `<div style="background:#3d0a0a;border:1px solid #f44336;border-radius:8px;padding:12px 16px;margin-bottom:20px;color:#f44336;font-size:13px">
      ⚠️ Could not load cloud feedback: ${apiError}. Showing local data only.
    </div>`;
  }

  // Summary stats bar
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin-bottom:32px">
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:28px;font-weight:700;color:var(--text)">${totalCount}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Total Feedback</div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:28px;font-weight:700;color:#0078d4">${cloudCount}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">☁️ Cloud Synced</div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:28px;font-weight:700;color:#ff9800">${localCount}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">💾 Local Only</div>
    </div>
    ${Object.entries(statusCounts).map(([status, count]) => {
      const badge = statusBadges[status] || statusBadges['unknown'];
      return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:${badge.color}">${count}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${badge.label}</div>
      </div>`;
    }).join('')}
  </div>`;

  // Feedback table
  if (allFeedback.length === 0) {
    html += `<div style="text-align:center;padding:60px">
      <div style="font-size:48px;margin-bottom:16px">📭</div>
      <h3 style="color:var(--text);margin-bottom:8px">No feedback yet</h3>
      <p style="color:var(--text-secondary);font-size:13px">Go to Diagnostics → select a diagnostic → test it → submit feedback</p>
    </div>`;
  } else {
    html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--surface-hover);text-align:left">
            <th style="padding:12px 16px;color:var(--text-secondary);font-weight:600;border-bottom:1px solid var(--border)">Diagnostic</th>
            <th style="padding:12px 16px;color:var(--text-secondary);font-weight:600;border-bottom:1px solid var(--border)">Area</th>
            <th style="padding:12px 16px;color:var(--text-secondary);font-weight:600;border-bottom:1px solid var(--border)">Status</th>
            <th style="padding:12px 16px;color:var(--text-secondary);font-weight:600;border-bottom:1px solid var(--border)">Severity</th>
            <th style="padding:12px 16px;color:var(--text-secondary);font-weight:600;border-bottom:1px solid var(--border)">Submitted By</th>
            <th style="padding:12px 16px;color:var(--text-secondary);font-weight:600;border-bottom:1px solid var(--border)">Date</th>
            <th style="padding:12px 16px;color:var(--text-secondary);font-weight:600;border-bottom:1px solid var(--border)">Source</th>
          </tr>
        </thead>
        <tbody>
          ${allFeedback.map(f => {
            const status = f.testResult || f.status || 'unknown';
            const badge = statusBadges[status] || statusBadges['unknown'];
            const sevColors = { low: '#4caf50', medium: '#ff9800', high: '#f44336', critical: '#d32f2f' };
            const date = f.createdAt ? new Date(f.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
            return `<tr style="border-bottom:1px solid var(--border)" title="${(f.description || f.notes || '').replace(/"/g, '&quot;').substring(0, 300)}">
              <td style="padding:12px 16px;color:var(--text);max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.diagnosticName || '-'}</td>
              <td style="padding:12px 16px"><span style="font-size:11px;background:${f.area === 'dlp' ? '#0d3320' : '#2a1a4a'};color:${f.area === 'dlp' ? '#4caf50' : '#a08ae0'};padding:2px 8px;border-radius:8px">${(f.area || f.category || '-').toUpperCase()}</span></td>
              <td style="padding:12px 16px"><span style="font-size:11px;background:${badge.bg};color:${badge.color};padding:2px 8px;border-radius:8px">${badge.label}</span></td>
              <td style="padding:12px 16px"><span style="color:${sevColors[f.severity] || '#9e9e9e'};font-weight:600;text-transform:capitalize">${f.severity || '-'}</span></td>
              <td style="padding:12px 16px;color:var(--text-secondary)">${f.submittedBy || f.submittedByEmail || '-'}</td>
              <td style="padding:12px 16px;color:var(--text-secondary);white-space:nowrap">${date}</td>
              <td style="padding:12px 16px"><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:${f.source === 'cloud' ? '#002b4d' : '#3d2800'};color:${f.source === 'cloud' ? '#0078d4' : '#ff9800'}">${f.source === 'cloud' ? '☁️ Cloud' : '💾 Local'}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

    // Expandable details under table
    html += `<div style="margin-top:24px">
      <h3 style="font-size:15px;color:var(--text);margin-bottom:16px">📝 Detailed Notes</h3>
      ${allFeedback.filter(f => f.description || f.notes).map((f, i) => `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong style="color:var(--text);font-size:13px">${f.diagnosticName || 'Unnamed'}</strong>
            <span style="font-size:11px;color:var(--text-secondary)">${f.submittedBy || '-'} · ${f.createdAt ? new Date(f.createdAt).toLocaleDateString() : '-'}</span>
          </div>
          <p style="color:var(--text-secondary);font-size:13px;line-height:1.6;margin:0;white-space:pre-wrap">${(f.description || f.notes || '').substring(0, 1000)}</p>
        </div>
      `).join('')}
    </div>`;
  }

  container.innerHTML = html;
}

function exportFeedbackReport() {
  // Gather all visible feedback and export as CSV
  const localFeedback = JSON.parse(localStorage.getItem('purview-diag-feedback') || '[]');
  
  const rows = [['Diagnostic', 'Area', 'Status', 'Severity', 'Notes', 'Submitted By', 'Date', 'Source']];
  localFeedback.forEach(f => {
    rows.push([
      f.diagnosticName || '',
      f.area || '',
      f.status || '',
      f.severity || '',
      (f.notes || '').replace(/[\n\r,]/g, ' '),
      'Local',
      f.timestamp || '',
      'local'
    ]);
  });

  // Also try API data if we have it cached
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `purview-feedback-report-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderPGView() {
  // Show the product entry points landing
  document.getElementById('pg-content').innerHTML = `
    <div style="text-align:center;margin-bottom:32px">
      <h2 style="font-size:20px;color:var(--text);margin-bottom:8px">Select a Diagnostic Entry Point</h2>
      <p style="font-size:13px;color:var(--text-secondary)">Choose the product area to view scenario-based test results and feedback</p>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:900px;margin:0 auto">
      <!-- DLP Solutions Page -->
      <div onclick="showPGProduct('dlp-solutions')" style="cursor:pointer;background:var(--surface);border:2px solid var(--border);border-radius:14px;padding:28px 24px;transition:all .2s ease;box-shadow:var(--shadow-sm)" onmouseover="this.style.borderColor='#107c10';this.style.transform='translateY(-3px)';this.style.boxShadow='0 6px 20px rgba(16,124,16,.15)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform='none';this.style.boxShadow='var(--shadow-sm)'">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:40px;height:40px;background:#0d3320;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px">🛡️</div>
          <div>
            <h3 style="font-size:15px;color:var(--text)">Data Loss Prevention</h3>
            <p style="font-size:11px;color:var(--text-muted)">Solutions → DLP → Diagnostics</p>
          </div>
        </div>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">7 diagnostics: Policy enforcement, alerts, endpoint sync, file analysis, policy tips, message trace</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span style="font-size:10px;background:var(--surface-hover);padding:2px 8px;border-radius:10px;border:1px solid var(--border)">7 Scenarios</span>
        </div>
      </div>

      <!-- Information Protection Solutions Page -->
      <div onclick="showPGProduct('ip-solutions')" style="cursor:pointer;background:var(--surface);border:2px solid var(--border);border-radius:14px;padding:28px 24px;transition:all .2s ease;box-shadow:var(--shadow-sm)" onmouseover="this.style.borderColor='#0078d4';this.style.transform='translateY(-3px)';this.style.boxShadow='0 6px 20px rgba(0,120,212,.15)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform='none';this.style.boxShadow='var(--shadow-sm)'">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:40px;height:40px;background:#1a2a4a;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px">🏷️</div>
          <div>
            <h3 style="font-size:15px;color:var(--text)">Information Protection</h3>
            <p style="font-size:11px;color:var(--text-muted)">Solutions → Info Protection → Diagnostics</p>
          </div>
        </div>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">3 diagnostics: Encryption settings, sensitivity label policy, auto-labeling file check</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span style="font-size:10px;background:var(--surface-hover);padding:2px 8px;border-radius:10px;border:1px solid var(--border)">8 Scenarios</span>
        </div>
      </div>

      <!-- M365 Admin Center Help Pane -->
      <div onclick="showPGProduct('m365-help')" style="cursor:pointer;background:var(--surface);border:2px solid var(--border);border-radius:14px;padding:28px 24px;transition:all .2s ease;box-shadow:var(--shadow-sm)" onmouseover="this.style.borderColor='#ff8c00';this.style.transform='translateY(-3px)';this.style.boxShadow='0 6px 20px rgba(255,140,0,.15)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform='none';this.style.boxShadow='var(--shadow-sm)'">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:40px;height:40px;background:#3a2a0a;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px">💬</div>
          <div>
            <h3 style="font-size:15px;color:var(--text)">M365 Admin Center</h3>
            <p style="font-size:11px;color:var(--text-muted)">Help Pane → Support Assistant</p>
          </div>
        </div>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Support Assistant chatbot: DLP config, sensitivity labels, OME, audit, archive, retention, eDiscovery</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span style="font-size:10px;background:var(--surface-hover);padding:2px 8px;border-radius:10px;border:1px solid var(--border)">9 Diagnostics</span>
        </div>
      </div>

      <!-- Purview Portal Help Pane -->
      <div onclick="showPGProduct('purview-help')" style="cursor:pointer;background:var(--surface);border:2px solid var(--border);border-radius:14px;padding:28px 24px;transition:all .2s ease;box-shadow:var(--shadow-sm)" onmouseover="this.style.borderColor='#6264a7';this.style.transform='translateY(-3px)';this.style.boxShadow='0 6px 20px rgba(98,100,167,.15)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform='none';this.style.boxShadow='var(--shadow-sm)'">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:40px;height:40px;background:#2a1a4a;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px">❓</div>
          <div>
            <h3 style="font-size:15px;color:var(--text)">Purview Portal</h3>
            <p style="font-size:11px;color:var(--text-muted)">Help & Support → Ask a question</p>
          </div>
        </div>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Help and support pane: Same diagnostics as M365 Admin but accessed via Purview portal</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span style="font-size:10px;background:var(--surface-hover);padding:2px 8px;border-radius:10px;border:1px solid var(--border)">9 Diagnostics</span>
        </div>
      </div>
    </div>

    <div style="margin-top:32px;text-align:center">
      <button onclick="showPGProduct('all')" style="background:var(--surface);border:1px solid var(--border);color:var(--text);padding:8px 20px;border-radius:20px;cursor:pointer;font-size:13px">📊 View All Findings & Recommendations</button>
    </div>
  `;
}

function showPGProduct(product) {
  const feedbackData = JSON.parse(localStorage.getItem('purview-feedback') || '[]');
  const intakeData = JSON.parse(localStorage.getItem('purview-intake') || '[]');
  const allFeedback = [...feedbackData, ...intakeData];

  // Map products to test plan areas and diagnostics
  const productConfig = {
    'dlp-solutions': {
      title: '🛡️ Data Loss Prevention — Solutions Page Diagnostics',
      subtitle: 'Purview → Data Loss Prevention → Diagnostics',
      color: '#107c10',
      areas: ['dlp'],
      diagnostics: solutionsDiagnostics.filter(d => d.area === 'dlp'),
      scenarios: testPlans.filter(tp => tp.area === 'dlp')
    },
    'ip-solutions': {
      title: '🏷️ Information Protection — Solutions Page Diagnostics',
      subtitle: 'Purview → Information Protection → Diagnostics',
      color: '#0078d4',
      areas: ['labels', 'encryption'],
      diagnostics: solutionsDiagnostics.filter(d => d.area === 'labels' || d.area === 'encryption'),
      scenarios: testPlans.filter(tp => tp.area === 'labels' || tp.area === 'encryption')
    },
    'm365-help': {
      title: '💬 Microsoft 365 Admin Center — Help Pane',
      subtitle: 'M365 Admin → Help icon → Support Assistant',
      color: '#ff8c00',
      areas: ['all'],
      diagnostics: helpDiagnostics,
      scenarios: testPlans.filter(tp => tp.entryPoint.includes('Help Pane') || tp.entryPoint.includes('BOTH'))
    },
    'purview-help': {
      title: '❓ Purview Portal — Help & Support Pane',
      subtitle: 'Purview Portal → Help icon → Ask a question',
      color: '#6264a7',
      areas: ['all'],
      diagnostics: helpDiagnostics,
      scenarios: testPlans.filter(tp => tp.entryPoint.includes('Help Pane') || tp.entryPoint.includes('BOTH'))
    }
  };

  let html = `<button onclick="renderPGView()" style="background:var(--surface);border:1px solid var(--border);color:var(--text);padding:6px 16px;border-radius:20px;cursor:pointer;font-size:12px;margin-bottom:20px">← Back to Entry Points</button>`;

  if (product === 'all') {
    // Show all findings and recommendations
    html += `<h2 style="font-size:18px;margin-bottom:16px">📊 All Findings & Recommendations</h2>`;
    html += renderPGFindings(allFeedback);
    document.getElementById('pg-content').innerHTML = html;
    return;
  }

  const config = productConfig[product];
  if (!config) return;

  html += `
    <div style="border-left:4px solid ${config.color};padding-left:16px;margin-bottom:24px">
      <h2 style="font-size:18px;color:var(--text)">${config.title}</h2>
      <p style="font-size:13px;color:var(--text-secondary)">${config.subtitle}</p>
    </div>`;

  // ── SUBMITTED REPORTS LISTING ──
  const reports = JSON.parse(localStorage.getItem('purview-reports-'+product) || '[]');
  if (reports.length > 0) {
    html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:24px">
      <h3 style="font-size:14px;color:var(--text);margin:0 0 12px">📄 Submitted Reports (${reports.length})</h3>
      <div style="display:flex;flex-direction:column;gap:6px">`;
    reports.forEach((r, i) => {
      const statusIcon = r.status==='pass'?'✅':r.status==='fail'?'❌':r.status==='partial'?'⚠️':'⬜';
      html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px">
        <span>${statusIcon}</span>
        <a href="#" onclick="openReport('${product}',${i});return false" style="flex:1;color:var(--primary);font-size:12px;text-decoration:none;font-weight:500">${r.title}</a>
        <span style="font-size:11px;color:var(--text-muted)">${new Date(r.timestamp).toLocaleDateString()}</span>
        <button onclick="deleteReport('${product}',${i})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:12px" title="Delete">🗑️</button>
      </div>`;
    });
    html += `</div></div>`;
  }

  // ── STATUS FILTER ──
  html += `<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
    <span style="font-size:12px;color:var(--text-secondary);padding-top:4px">Filter:</span>
    <button onclick="filterPGStatus('all')" class="btn btn-sm btn-outline" style="font-size:11px">All</button>
    <button onclick="filterPGStatus('tested')" class="btn btn-sm btn-outline" style="font-size:11px">✅ Tested</button>
    <button onclick="filterPGStatus('not-tested')" class="btn btn-sm btn-outline" style="font-size:11px">⬜ Not Tested</button>
    <button onclick="filterPGStatus('fail')" class="btn btn-sm btn-outline" style="font-size:11px">❌ Fail</button>
  </div>`;

  // ── TEST SCENARIOS ──
  html += `<h3 style="font-size:14px;margin:20px 0 12px;color:var(--text-secondary)">Test Scenarios & Results</h3>`;
  if (config.scenarios.length === 0) {
    html += `<p style="color:var(--text-muted);font-size:13px;padding:20px;background:var(--surface);border-radius:8px;border:1px solid var(--border)">No specific test scenarios mapped to this entry point yet. Testing in progress.</p>`;
  } else {
    config.scenarios.forEach(tp => {
      const saved = JSON.parse(localStorage.getItem('pg-evidence-'+tp.id) || '{}');
      const status = saved.status || 'not-tested';
      const statusBadge = status==='pass'?'<span style="background:#0d3320;color:#4caf50;padding:2px 8px;border-radius:10px;font-size:11px">✅ Pass</span>':
        status==='fail'?'<span style="background:#3a1a1a;color:#f44;padding:2px 8px;border-radius:10px;font-size:11px">❌ Fail</span>':
        status==='partial'?'<span style="background:#3a2a0a;color:#ff8c00;padding:2px 8px;border-radius:10px;font-size:11px">⚠️ Partial</span>':
        '<span style="background:var(--surface-hover);color:var(--text-muted);padding:2px 8px;border-radius:10px;font-size:11px">⬜ Not Tested</span>';

      html += `
      <div class="pg-scenario-card" data-status="${status}" style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;margin:16px 0;border-left:4px solid ${config.color}">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <h4 style="font-size:14px;color:var(--text)">${tp.title}</h4>
          ${statusBadge}
        </div>
        <p style="font-size:12px;color:var(--text-secondary);margin:8px 0">${tp.objective}</p>

        <!-- Evidence Submission Box -->
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px;margin-top:12px">
          <div style="margin-bottom:10px">
            <label style="font-size:12px;font-weight:600;color:var(--text)">Result:</label>
            <select id="ev-status-${tp.id}" style="margin-left:8px;padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:12px" onchange="saveEvidence('${tp.id}')">
              <option value="not-tested" ${status==='not-tested'?'selected':''}>⬜ Not Tested</option>
              <option value="pass" ${status==='pass'?'selected':''}>✅ Pass</option>
              <option value="partial" ${status==='partial'?'selected':''}>⚠️ Partial</option>
              <option value="fail" ${status==='fail'?'selected':''}>❌ Fail</option>
            </select>
          </div>
          <div style="margin-bottom:10px">
            <label style="font-size:12px;font-weight:600;color:var(--text);display:block;margin-bottom:4px">📝 What I Tested & Findings:</label>
            <textarea id="ev-notes-${tp.id}" style="width:100%;min-height:80px;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:12px;font-family:inherit;resize:vertical" placeholder="Describe what you did, what happened, and what should have happened..." oninput="saveEvidence('${tp.id}')">${saved.notes||''}</textarea>
          </div>
          <div style="margin-bottom:10px">
            <label style="font-size:12px;font-weight:600;color:var(--text);display:block;margin-bottom:4px">📎 Attach Evidence (screenshots, logs, recordings):</label>
            <input type="file" id="ev-files-${tp.id}" multiple accept="image/*,.html,.txt,.log,.csv,.har,.mp4,.webm" onchange="handleEvidenceFiles('${tp.id}')" style="font-size:12px;color:var(--text)">
            <div id="ev-preview-${tp.id}" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${renderSavedPreviews(saved)}</div>
          </div>
          <button onclick="saveEvidence('${tp.id}')" style="background:var(--primary);color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:12px">💾 Save</button>
          <button onclick="aiSuggestInline('${tp.id}','predefined')" style="background:linear-gradient(135deg,#8b5cf6,#6264a7);color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:12px;margin-left:8px">🤖 AI Suggest</button>
          <button onclick="submitFeedback('${tp.id}','predefined')" style="background:linear-gradient(135deg,#0078d4,#6264a7);color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:12px;margin-left:8px">📤 Submit Feedback</button>
          <div id="ai-suggestion-${tp.id}" style="margin-top:10px"></div>
        </div>
      </div>`;
    });
  }

  // Render saved custom scenarios for this product
  const customScenarios = JSON.parse(localStorage.getItem('pg-custom-scenarios-'+product) || '[]');
  if (customScenarios.length > 0) {
    html += `<h3 style="font-size:14px;margin:24px 0 12px;color:var(--accent)">🔍 Custom Observed Scenarios</h3>`;
    customScenarios.forEach((cs, idx) => {
      const csBadge = cs.status==='pass'?'<span style="background:#0d3320;color:#4caf50;padding:2px 8px;border-radius:10px;font-size:11px">✅ Pass</span>':
        cs.status==='fail'?'<span style="background:#3a1a1a;color:#f44;padding:2px 8px;border-radius:10px;font-size:11px">❌ Fail</span>':
        cs.status==='partial'?'<span style="background:#3a2a0a;color:#ff8c00;padding:2px 8px;border-radius:10px;font-size:11px">⚠️ Partial</span>':
        '<span style="background:var(--surface-hover);color:var(--text-muted);padding:2px 8px;border-radius:10px;font-size:11px">⬜ Not Tested</span>';

      html += `
      <div class="pg-scenario-card" data-status="${cs.status||'not-tested'}" style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;margin:16px 0;border-left:4px solid var(--accent)">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <h4 style="font-size:14px;color:var(--text)">🔍 ${cs.title}</h4>
          <div style="display:flex;gap:6px;align-items:center">
            ${csBadge}
            <button onclick="deleteCustomScenario('${product}',${idx})" style="background:none;border:1px solid var(--danger);color:var(--danger);padding:2px 8px;border-radius:6px;cursor:pointer;font-size:11px" title="Delete this scenario">🗑️</button>
          </div>
        </div>
        <p style="font-size:12px;color:var(--text-secondary);margin:8px 0">${cs.notes||''}</p>
        ${cs.files && cs.files.length > 0 ? '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0">'+cs.files.map(f => f.type && f.type.startsWith('image/') ? '<img src="'+f.data+'" style="width:80px;height:60px;object-fit:cover;border-radius:4px;border:1px solid var(--border)">' : '<span style="background:var(--surface-hover);padding:4px 8px;border-radius:4px;font-size:11px;border:1px solid var(--border)">📄 '+f.name+'</span>').join('')+'</div>' : ''}
        <p style="font-size:11px;color:var(--text-muted);margin-top:6px">Added: ${new Date(cs.timestamp).toLocaleString()}</p>
        <button onclick="submitFeedback('${product}-custom-${idx}','custom-existing',${idx},'${product}')" style="background:linear-gradient(135deg,#0078d4,#6264a7);color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:12px;margin-top:8px">📤 Submit Feedback</button>
      </div>`;
    });
  }

  // Add Custom Scenario form
  html += `
  <div style="background:var(--surface);border:2px dashed var(--border);border-radius:10px;padding:20px;margin:20px 0">
    <h4 style="font-size:14px;color:var(--accent);margin-bottom:12px">➕ Add Custom Scenario</h4>
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Observed something not listed above? Add your own scenario with findings.</p>
    <div style="margin-bottom:10px">
      <label style="font-size:12px;font-weight:600;color:var(--text);display:block;margin-bottom:4px">Scenario Title:</label>
      <input type="text" id="custom-title-${product}" placeholder="e.g., DLP policy not triggering for Teams messages" style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:12px;box-sizing:border-box">
    </div>
    <div style="margin-bottom:10px">
      <label style="font-size:12px;font-weight:600;color:var(--text)">Result:</label>
      <select id="custom-status-${product}" style="margin-left:8px;padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:12px">
        <option value="not-tested">⬜ Not Tested</option>
        <option value="pass">✅ Pass</option>
        <option value="partial">⚠️ Partial</option>
        <option value="fail" selected>❌ Fail</option>
      </select>
    </div>
    <div style="margin-bottom:10px">
      <label style="font-size:12px;font-weight:600;color:var(--text);display:block;margin-bottom:4px">📝 What I Observed:</label>
      <textarea id="custom-notes-${product}" style="width:100%;min-height:80px;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:12px;font-family:inherit;resize:vertical;box-sizing:border-box" placeholder="Describe what you did, what happened, and what should have happened..."></textarea>
    </div>
    <div style="margin-bottom:10px">
      <label style="font-size:12px;font-weight:600;color:var(--text);display:block;margin-bottom:4px">📎 Attach Evidence:</label>
      <input type="file" id="custom-files-${product}" multiple accept="image/*,.html,.txt,.log,.csv,.har,.mp4,.webm" style="font-size:12px;color:var(--text)">
    </div>
    <button onclick="addCustomScenario('${product}')" style="background:var(--accent);color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">➕ Add Scenario</button>
    <button onclick="aiSuggestInline('${product}','custom')" style="background:linear-gradient(135deg,#8b5cf6,#6264a7);color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;margin-left:8px">🤖 AI Suggest</button>
    <div id="ai-suggestion-custom-${product}" style="margin-top:10px"></div>
  </div>`;

  // ── AVAILABLE DIAGNOSTICS (bottom reference) ──
  const trackerData = JSON.parse(localStorage.getItem('purview-tracker') || '{}');
  html += `<details style="margin-top:32px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px">
    <summary style="font-size:14px;color:var(--text-secondary);cursor:pointer;font-weight:600">📋 Available Diagnostics Reference (${config.diagnostics.length})</summary>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">`;
  config.diagnostics.forEach(d => {
    const status = trackerData[d.id]?.status || 'not-tested';
    const statusIcon = status==='pass'?'✅':status==='fail'?'❌':status==='partial'?'⚠️':'⬜';
    html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>${d.name}</strong>
        <span>${statusIcon}</span>
      </div>
      <p style="color:var(--text-muted);font-size:11px;margin-top:4px">${d.checks}</p>
    </div>`;
  });
  html += `</div></details>`;

  // Critical findings for this product area (if any)
  if (product === 'm365-help' || product === 'purview-help') {
    html += `
    <div class="pg-extra-section">
    <h3 style="font-size:14px;margin:24px 0 12px;color:var(--danger)">🔴 Critical Findings</h3>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;margin:12px 0;border-left:4px solid var(--danger)">
      <h4 style="font-size:14px;color:var(--text)">Agent Returns Wrong Answer for DLP Question</h4>
      <p style="font-size:12px;color:var(--text-secondary);margin:4px 0">Tested: 2026-05-13 | Query: "user unable to edit the DLP policy"</p>
      <div style="background:#0a0a1a;border:1px solid #333;border-radius:6px;padding:12px;margin:10px 0;font-size:12px;font-family:monospace">
        <div style="color:#f48">🤖 "How can I help you today?"</div>
        <div style="color:#4caf50">👤 "user unable to edit the DLP policy"</div>
        <div style="color:#f48">🤖 "Can you confirm if issue is with Microsoft Purview Compliance?"</div>
        <div style="color:#4caf50">👤 "yes"</div>
        <div style="background:#2a0a0a;padding:6px;border-radius:4px;margin-top:6px;color:#f44">🤖 ❌ "Change a name and email address — Go to Users > Active Users..."</div>
      </div>
      <ul style="font-size:12px;color:var(--text-secondary);padding-left:16px;margin:8px 0">
        <li>Response COMPLETELY WRONG — DLP question got user name change answer</li>
        <li>No diagnostic triggered despite exact keywords</li>
        <li>No error recovery — agent gave up after wrong answer</li>
      </ul>
      <div style="background:#0d3320;border:1px solid #1a5a3a;border-radius:6px;padding:10px;margin-top:10px;font-size:12px">
        <strong style="color:#4caf50">💡 Recommendation:</strong> Detect keywords → present structured options → auto-run diagnostic
      </div>
    </div>
    </div>`;
  }

  document.getElementById('pg-content').innerHTML = html;
}

function renderPGFindings(allFeedback) {
  let html = '';
  // Critical findings
  html += `
  <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;margin:12px 0;border-left:4px solid var(--danger)">
    <h4 style="font-size:14px;color:var(--text)">🔴 Agent Returns Wrong Answer for DLP Question</h4>
    <p style="font-size:12px;color:var(--text-secondary)">Help Pane | 2026-05-13 | Query: "user unable to edit the DLP policy" → Got user name change instructions</p>
  </div>`;

  // Dynamic feedback
  if (allFeedback.length > 0) {
    allFeedback.forEach((fb,i) => {
      html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;margin:8px 0">
        <h4 style="font-size:13px">${fb.title||fb.category||'Finding #'+(i+1)}</h4>
        <p style="font-size:12px;color:var(--text-secondary)">${fb.description||''}</p>
      </div>`;
    });
  }

  // Recommendations
  html += `<h3 style="font-size:14px;margin:24px 0 12px;color:var(--accent)">💡 Prioritized Recommendations</h3>`;
  improvements.forEach(imp => {
    html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;margin:8px 0;border-left:4px solid ${imp.priority==='P0'?'var(--danger)':'var(--warning)'}">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="background:${imp.priority==='P0'?'#3a1a1a':'#3a2a0a'};color:${imp.priority==='P0'?'#f44':'#ff8c00'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${imp.priority}</span>
        <strong style="font-size:13px">${imp.title}</strong>
      </div>
      <p style="font-size:12px;color:var(--text-secondary);margin:6px 0">${imp.problem}</p>
      <p style="font-size:12px;color:var(--success)">${imp.solution}</p>
    </div>`;
  });
  return html;
}

function renderSavedPreviews(saved) {
  if (!saved.files || saved.files.length === 0) return '';
  return saved.files.map((f,i) => {
    if (f.type && f.type.startsWith('image/')) {
      return '<div style="position:relative"><img src="'+f.data+'" style="width:80px;height:60px;object-fit:cover;border-radius:4px;border:1px solid var(--border)"><button onclick="removeEvFile(\''+saved.id+'\','+i+')" style="position:absolute;top:-4px;right:-4px;background:var(--danger);color:#fff;border:none;border-radius:50%;width:16px;height:16px;font-size:10px;cursor:pointer;line-height:16px">×</button></div>';
    }
    return '<div style="background:var(--surface-hover);padding:4px 8px;border-radius:4px;font-size:11px;border:1px solid var(--border);position:relative">📄 '+f.name+'<button onclick="removeEvFile(\''+saved.id+'\','+i+')" style="margin-left:6px;background:none;border:none;color:var(--danger);cursor:pointer;font-size:12px">×</button></div>';
  }).join('');
}

function saveEvidence(tpId) {
  const statusEl = document.getElementById('ev-status-'+tpId);
  const notesEl = document.getElementById('ev-notes-'+tpId);
  const existing = JSON.parse(localStorage.getItem('pg-evidence-'+tpId) || '{}');
  existing.id = tpId;
  existing.status = statusEl ? statusEl.value : 'not-tested';
  existing.notes = notesEl ? notesEl.value : '';
  existing.timestamp = new Date().toISOString();
  if (!existing.files) existing.files = [];
  localStorage.setItem('pg-evidence-'+tpId, JSON.stringify(existing));
}

function handleEvidenceFiles(tpId) {
  const input = document.getElementById('ev-files-'+tpId);
  const existing = JSON.parse(localStorage.getItem('pg-evidence-'+tpId) || '{}');
  if (!existing.files) existing.files = [];
  existing.id = tpId;

  const promises = Array.from(input.files).map(file => {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => {
        existing.files.push({ name: file.name, type: file.type, size: file.size, data: reader.result });
        resolve();
      };
      reader.readAsDataURL(file);
    });
  });

  Promise.all(promises).then(() => {
    localStorage.setItem('pg-evidence-'+tpId, JSON.stringify(existing));
    const preview = document.getElementById('ev-preview-'+tpId);
    if (preview) preview.innerHTML = renderSavedPreviews(existing);
  });
}

function removeEvFile(tpId, idx) {
  const existing = JSON.parse(localStorage.getItem('pg-evidence-'+tpId) || '{}');
  if (existing.files) {
    existing.files.splice(idx, 1);
    localStorage.setItem('pg-evidence-'+tpId, JSON.stringify(existing));
    const preview = document.getElementById('ev-preview-'+tpId);
    if (preview) preview.innerHTML = renderSavedPreviews(existing);
  }
}

function addCustomScenario(product) {
  const titleEl = document.getElementById('custom-title-'+product);
  const statusEl = document.getElementById('custom-status-'+product);
  const notesEl = document.getElementById('custom-notes-'+product);
  const filesEl = document.getElementById('custom-files-'+product);

  if (!titleEl.value.trim()) { alert('Please enter a scenario title.'); return; }

  const scenario = {
    title: titleEl.value.trim(),
    status: statusEl.value,
    notes: notesEl.value.trim(),
    files: [],
    timestamp: new Date().toISOString()
  };

  const processFiles = filesEl.files.length > 0
    ? Promise.all(Array.from(filesEl.files).map(file => new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => { scenario.files.push({ name: file.name, type: file.type, size: file.size, data: reader.result }); resolve(); };
        reader.readAsDataURL(file);
      })))
    : Promise.resolve();

  processFiles.then(() => {
    const list = JSON.parse(localStorage.getItem('pg-custom-scenarios-'+product) || '[]');
    list.push(scenario);
    localStorage.setItem('pg-custom-scenarios-'+product, JSON.stringify(list));
    showPGProduct(product);
  });
}

function deleteCustomScenario(product, idx) {
  if (!confirm('Delete this custom scenario?')) return;
  const list = JSON.parse(localStorage.getItem('pg-custom-scenarios-'+product) || '[]');
  list.splice(idx, 1);
  localStorage.setItem('pg-custom-scenarios-'+product, JSON.stringify(list));
  showPGProduct(product);
}

async function submitFeedback(id, type, customIdx, customProduct) {
  let title, notes, status, files, product;

  if (type === 'predefined') {
    const tp = testPlans.find(t => t.id === id);
    if (!tp) { alert('Scenario not found'); return; }
    const ev = JSON.parse(localStorage.getItem('pg-evidence-'+id) || '{}');
    title = ev.aiTitle || tp.title;
    notes = ev.notes || '';
    status = ev.status || 'not-tested';
    files = ev.files || [];
    // Determine product from test plan area
    if (tp.area === 'dlp') product = 'dlp-solutions';
    else if (tp.area === 'labels' || tp.area === 'encryption') product = 'ip-solutions';
    else product = 'purview-help';
  } else if (type === 'custom-existing') {
    product = customProduct;
    const list = JSON.parse(localStorage.getItem('pg-custom-scenarios-'+product) || '[]');
    const cs = list[customIdx];
    if (!cs) { alert('Scenario not found'); return; }
    title = cs.title;
    notes = cs.notes || '';
    status = cs.status || 'not-tested';
    files = cs.files || [];
  }

  if (!notes.trim()) { alert('Please add observations before submitting.'); return; }

  // AI Enhancement
  const badgeText = status==='pass'?'✅ Pass':status==='fail'?'❌ Fail':status==='partial'?'⚠️ Partial':'⬜ Not Tested';
  const ai = await aiSummarize(title, notes, badgeText);
  const reportTitle = ai ? ai.title : title;
  const aiSummary = ai ? ai.summary : null;

  // Build HTML report
  const rpt = buildReportHTML(reportTitle, title, status, badgeText, notes, files, aiSummary);

  // Store report
  const reports = JSON.parse(localStorage.getItem('purview-reports-'+product) || '[]');
  reports.unshift({ title: reportTitle, originalTitle: title, status, timestamp: new Date().toISOString(), html: rpt });
  localStorage.setItem('purview-reports-'+product, JSON.stringify(reports));

  // Open in new tab
  const win = window.open('', '_blank');
  win.document.write(rpt);
  win.document.close();

  // Refresh PG view to show new report in list
  showPGProduct(product);
}

function openReport(product, idx) {
  const reports = JSON.parse(localStorage.getItem('purview-reports-'+product) || '[]');
  const r = reports[idx];
  if (!r) return;
  const win = window.open('', '_blank');
  win.document.write(r.html);
  win.document.close();
}

function deleteReport(product, idx) {
  if (!confirm('Delete this report?')) return;
  const reports = JSON.parse(localStorage.getItem('purview-reports-'+product) || '[]');
  reports.splice(idx, 1);
  localStorage.setItem('purview-reports-'+product, JSON.stringify(reports));
  showPGProduct(product);
}

function buildReportHTML(reportTitle, originalTitle, status, badgeText, notes, files, aiSummary) {
  const st = status;
  let rpt = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Feedback — ${reportTitle}</title>
<style>
body{font-family:'Segoe UI',sans-serif;max-width:900px;margin:0 auto;padding:40px;background:#1a1a2e;color:#e0e0e0}
h1{color:#0078d4;border-bottom:2px solid #0078d4;padding-bottom:12px;font-size:20px}
.meta{color:#a0a0a0;font-size:13px;margin-bottom:24px}
.badge{display:inline-block;padding:4px 14px;border-radius:12px;font-size:13px;font-weight:600}
.pass{background:#0d3320;color:#4caf50} .fail{background:#3a1a1a;color:#f44} .partial{background:#3a2a0a;color:#ff8c00} .not-tested{background:#333;color:#999}
.section{background:#16213e;border:1px solid #2a3a5e;border-radius:10px;padding:20px;margin:16px 0}
.ai-summary{background:linear-gradient(135deg,#16213e,#1a2a4e);border:1px solid #4aa3f9;border-radius:10px;padding:20px;margin:16px 0}
.notes{background:#0a1a2a;border:1px solid #2a4a6e;border-radius:6px;padding:14px;margin:10px 0;font-size:13px;white-space:pre-wrap}
.evidence img{max-width:100%;border-radius:6px;margin:8px 0;border:1px solid #2a3a5e}
.evidence .file-link{display:inline-block;background:#0a1a2a;padding:6px 12px;border-radius:6px;font-size:12px;margin:4px;border:1px solid #2a4a6e}
footer{margin-top:40px;padding-top:20px;border-top:1px solid #2a3a5e;color:#555;font-size:11px}
</style></head><body>
<h1>📋 ${reportTitle}</h1>
${reportTitle !== originalTitle ? '<p style="font-size:12px;color:#707070;margin-top:-8px">Original: '+originalTitle+'</p>' : ''}
<div class="meta">
  <strong>Status:</strong> <span class="badge ${st}">${badgeText}</span><br>
  <strong>Reviewers:</strong> Nandan Tripathi (natripat), Kapil Chopra (kchopra)<br>
  <strong>Submitted:</strong> ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} at ${new Date().toLocaleTimeString()}<br>
  <strong>Reference:</strong> <a href="https://learn.microsoft.com/en-ca/troubleshoot/microsoft-365/purview/diagnostics/purview-compliance-diagnostics" style="color:#4aa3f9">Microsoft Learn — Self-Help Diagnostics</a>
</div>`;

  if (aiSummary) {
    rpt += `<div class="ai-summary"><strong>🤖 AI Summary:</strong><p style="margin:8px 0 0;font-size:14px;line-height:1.6">${aiSummary}</p></div>`;
  }
  if (notes) {
    rpt += `<div class="section"><strong>📝 Tester's Observations:</strong><div class="notes">${notes}</div></div>`;
  }
  if (files && files.length > 0) {
    rpt += `<div class="section evidence"><strong>📎 Evidence (${files.length} files):</strong>`;
    files.forEach(f => {
      if (f.type && f.type.startsWith('image/')) {
        rpt += '<div><img src="'+f.data+'" alt="'+f.name+'"><p style="font-size:11px;color:#707070">'+f.name+'</p></div>';
      } else if (f.type && f.type.startsWith('video/')) {
        rpt += '<div><video controls style="max-width:100%;border-radius:6px"><source src="'+f.data+'" type="'+f.type+'"></video><p style="font-size:11px;color:#707070">'+f.name+'</p></div>';
      } else {
        rpt += '<span class="file-link">📄 '+f.name+' ('+Math.round(f.size/1024)+'KB)</span>';
      }
    });
    rpt += `</div>`;
  }
  rpt += `<footer>Generated from Purview Diagnostics Review Portal | ${new Date().toLocaleString()}</footer></body></html>`;
  return rpt;
}

async function generateCustomReport(product, idx) {
  const list = JSON.parse(localStorage.getItem('pg-custom-scenarios-'+product) || '[]');
  const cs = list[idx];
  if (!cs) { alert('Scenario not found'); return; }
  const st = cs.status || 'not-tested';
  const badgeText = st==='pass'?'✅ Pass':st==='fail'?'❌ Fail':st==='partial'?'⚠️ Partial':'⬜ Not Tested';
  const productNames = {'dlp-solutions':'DLP Solutions','ip-solutions':'Information Protection','m365-help':'M365 Admin Help Pane','purview-help':'Purview Portal Help'};

  // AI Enhancement
  const ai = await aiSummarize(cs.title, cs.notes, badgeText);
  const reportTitle = ai ? ai.title : cs.title;
  const aiSummary = ai ? ai.summary : null;

  let rpt = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Report — ${reportTitle}</title>
<style>
body{font-family:'Segoe UI',sans-serif;max-width:900px;margin:0 auto;padding:40px;background:#1a1a2e;color:#e0e0e0}
h1{color:#0078d4;border-bottom:2px solid #0078d4;padding-bottom:12px;font-size:20px}
.meta{color:#a0a0a0;font-size:13px;margin-bottom:24px}
.badge{display:inline-block;padding:4px 14px;border-radius:12px;font-size:13px;font-weight:600}
.pass{background:#0d3320;color:#4caf50} .fail{background:#3a1a1a;color:#f44} .partial{background:#3a2a0a;color:#ff8c00} .not-tested{background:#333;color:#999}
.section{background:#16213e;border:1px solid #2a3a5e;border-radius:10px;padding:20px;margin:16px 0}
.ai-summary{background:linear-gradient(135deg,#16213e,#1a2a4e);border:1px solid #4aa3f9;border-radius:10px;padding:20px;margin:16px 0}
.notes{background:#0a1a2a;border:1px solid #2a4a6e;border-radius:6px;padding:14px;margin:10px 0;font-size:13px;white-space:pre-wrap}
.evidence img{max-width:100%;border-radius:6px;margin:8px 0;border:1px solid #2a3a5e}
.evidence .file-link{display:inline-block;background:#0a1a2a;padding:6px 12px;border-radius:6px;font-size:12px;margin:4px;border:1px solid #2a4a6e}
footer{margin-top:40px;padding-top:20px;border-top:1px solid #2a3a5e;color:#555;font-size:11px}
</style></head><body>
<h1>🔍 ${reportTitle}</h1>
${ai ? '<p style="font-size:12px;color:#707070;margin-top:-8px">Original title: '+cs.title+'</p>' : ''}
<div class="meta">
  <strong>Type:</strong> Custom Observed Scenario<br>
  <strong>Product:</strong> ${productNames[product]||product}<br>
  <strong>Status:</strong> <span class="badge ${st}">${badgeText}</span><br>
  <strong>Reviewers:</strong> Nandan Tripathi (natripat), Kapil Chopra (kchopra)<br>
  <strong>Generated:</strong> ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} at ${new Date().toLocaleTimeString()}<br>
  <strong>Observed:</strong> ${new Date(cs.timestamp).toLocaleString()}
</div>`;

  if (aiSummary) {
    rpt += `<div class="ai-summary"><strong>🤖 AI Summary:</strong><p style="margin:8px 0 0;font-size:14px;line-height:1.6">${aiSummary}</p></div>`;
  }

  if (cs.notes) {
    rpt += `<div class="section"><strong>📝 Tester's Raw Observations:</strong><div class="notes">${cs.notes}</div></div>`;
  }
  if (cs.files && cs.files.length > 0) {
    rpt += `<div class="section evidence"><strong>📎 Evidence (${cs.files.length} files):</strong>`;
    cs.files.forEach(f => {
      if (f.type && f.type.startsWith('image/')) {
        rpt += '<div><img src="'+f.data+'" alt="'+f.name+'"><p style="font-size:11px;color:#707070">'+f.name+'</p></div>';
      } else if (f.type && f.type.startsWith('video/')) {
        rpt += '<div><video controls style="max-width:100%;border-radius:6px"><source src="'+f.data+'" type="'+f.type+'"></video><p style="font-size:11px;color:#707070">'+f.name+'</p></div>';
      } else {
        rpt += '<span class="file-link">📄 '+f.name+' ('+Math.round(f.size/1024)+'KB)</span>';
      }
    });
    rpt += `</div>`;
  }
  rpt += `<footer>Generated from Purview Diagnostics Review Portal | ${new Date().toLocaleString()}</footer></body></html>`;
  downloadFile('report-custom-'+product+'-'+idx+'.html', rpt, 'text/html');
}

async function generateSingleReport(tpId) {
  const tp = testPlans.find(t => t.id === tpId);
  if (!tp) { alert('Scenario not found'); return; }
  const ev = JSON.parse(localStorage.getItem('pg-evidence-'+tpId) || '{}');
  const st = ev.status || 'not-tested';
  const badgeText = st==='pass'?'✅ Pass':st==='fail'?'❌ Fail':st==='partial'?'⚠️ Partial':'⬜ Not Tested';

  // AI Enhancement — use cached suggestion if available, otherwise call AI
  let reportTitle, aiSummary;
  if (ev.aiTitle) {
    reportTitle = ev.aiTitle;
    aiSummary = ev.aiSummary || null;
  } else {
    const ai = await aiSummarize(tp.title, ev.notes, badgeText);
    reportTitle = ai ? ai.title : tp.title;
    aiSummary = ai ? ai.summary : null;
  }

  let rpt = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Report — ${reportTitle}</title>
<style>
body{font-family:'Segoe UI',sans-serif;max-width:900px;margin:0 auto;padding:40px;background:#1a1a2e;color:#e0e0e0}
h1{color:#0078d4;border-bottom:2px solid #0078d4;padding-bottom:12px;font-size:20px}
.meta{color:#a0a0a0;font-size:13px;margin-bottom:24px}
.badge{display:inline-block;padding:4px 14px;border-radius:12px;font-size:13px;font-weight:600}
.pass{background:#0d3320;color:#4caf50} .fail{background:#3a1a1a;color:#f44} .partial{background:#3a2a0a;color:#ff8c00} .not-tested{background:#333;color:#999}
.section{background:#16213e;border:1px solid #2a3a5e;border-radius:10px;padding:20px;margin:16px 0}
.ai-summary{background:linear-gradient(135deg,#16213e,#1a2a4e);border:1px solid #4aa3f9;border-radius:10px;padding:20px;margin:16px 0}
.notes{background:#0a1a2a;border:1px solid #2a4a6e;border-radius:6px;padding:14px;margin:10px 0;font-size:13px;white-space:pre-wrap}
.evidence img{max-width:100%;border-radius:6px;margin:8px 0;border:1px solid #2a3a5e}
.evidence .file-link{display:inline-block;background:#0a1a2a;padding:6px 12px;border-radius:6px;font-size:12px;margin:4px;border:1px solid #2a4a6e}
footer{margin-top:40px;padding-top:20px;border-top:1px solid #2a3a5e;color:#555;font-size:11px}
</style></head><body>
<h1>📋 ${reportTitle}</h1>
${ai ? '<p style="font-size:12px;color:#707070;margin-top:-8px">Original: '+tp.title+'</p>' : ''}
<div class="meta">
  <strong>Status:</strong> <span class="badge ${st}">${badgeText}</span><br>
  <strong>Objective:</strong> ${tp.objective}<br>
  <strong>Entry Point:</strong> ${tp.entryPoint}<br>
  <strong>Reviewers:</strong> Nandan Tripathi (natripat), Kapil Chopra (kchopra)<br>
  <strong>Generated:</strong> ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} at ${new Date().toLocaleTimeString()}<br>
  <strong>Reference:</strong> <a href="https://learn.microsoft.com/en-ca/troubleshoot/microsoft-365/purview/diagnostics/purview-compliance-diagnostics" style="color:#4aa3f9">Microsoft Learn — Self-Help Diagnostics</a>
</div>`;

  if (aiSummary) {
    rpt += `<div class="ai-summary"><strong>🤖 AI Summary:</strong><p style="margin:8px 0 0;font-size:14px;line-height:1.6">${aiSummary}</p></div>`;
  }

  if (ev.notes) {
    rpt += `<div class="section"><strong>📝 Tester's Raw Observations:</strong><div class="notes">${ev.notes}</div></div>`;
  }
  if (ev.files && ev.files.length > 0) {
    rpt += `<div class="section evidence"><strong>📎 Evidence (${ev.files.length} files):</strong>`;
    ev.files.forEach(f => {
      if (f.type && f.type.startsWith('image/')) {
        rpt += '<div><img src="'+f.data+'" alt="'+f.name+'"><p style="font-size:11px;color:#707070">'+f.name+'</p></div>';
      } else if (f.type && f.type.startsWith('video/')) {
        rpt += '<div><video controls style="max-width:100%;border-radius:6px"><source src="'+f.data+'" type="'+f.type+'"></video><p style="font-size:11px;color:#707070">'+f.name+'</p></div>';
      } else {
        rpt += '<span class="file-link">📄 '+f.name+' ('+Math.round(f.size/1024)+'KB)</span>';
      }
    });
    rpt += `</div>`;
  }
  if (!ev.notes && (!ev.files || ev.files.length === 0)) {
    rpt += `<div class="section"><p style="color:#555;font-style:italic">No evidence submitted yet for this scenario.</p></div>`;
  }
  if (ev.timestamp) {
    rpt += `<p style="font-size:11px;color:#555;margin-top:12px">Last updated: ${new Date(ev.timestamp).toLocaleString()}</p>`;
  }
  rpt += `<footer>Generated from Purview Diagnostics Review Portal | ${new Date().toLocaleString()}</footer></body></html>`;
  downloadFile('report-'+tpId+'.html', rpt, 'text/html');
}

function generateScenarioReport(product) {
  const productNames = {
    'dlp-solutions': 'Data Loss Prevention — Solutions Page',
    'ip-solutions': 'Information Protection — Solutions Page',
    'm365-help': 'Microsoft 365 Admin Center — Help Pane',
    'purview-help': 'Purview Portal — Help & Support'
  };

  const productConfig = {
    'dlp-solutions': { scenarios: testPlans.filter(tp => tp.area === 'dlp') },
    'ip-solutions': { scenarios: testPlans.filter(tp => tp.area === 'labels' || tp.area === 'encryption') },
    'm365-help': { scenarios: testPlans.filter(tp => tp.entryPoint.includes('Help Pane') || tp.entryPoint.includes('BOTH')) },
    'purview-help': { scenarios: testPlans.filter(tp => tp.entryPoint.includes('Help Pane') || tp.entryPoint.includes('BOTH')) }
  };

  const scenarios = productConfig[product]?.scenarios || testPlans;
  const title = productNames[product] || 'All Diagnostics';
  let tested=0, passed=0, failed=0, partial=0;

  scenarios.forEach(tp => {
    const ev = JSON.parse(localStorage.getItem('pg-evidence-'+tp.id) || '{}');
    if (ev.status && ev.status !== 'not-tested') { tested++; if(ev.status==='pass')passed++; if(ev.status==='fail')failed++; if(ev.status==='partial')partial++; }
  });

  let rpt = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PG Report — ${title}</title>
<style>
body{font-family:'Segoe UI',sans-serif;max-width:1000px;margin:0 auto;padding:40px;background:#1a1a2e;color:#e0e0e0}
h1{color:#0078d4;border-bottom:2px solid #0078d4;padding-bottom:12px}
h2{color:#6264a7;margin-top:28px}
h3{margin-top:20px}
.meta{color:#a0a0a0;font-size:13px;margin-bottom:24px}
.stat-row{display:flex;gap:16px;margin:20px 0}
.stat-box{background:#16213e;border:1px solid #2a3a5e;border-radius:10px;padding:16px 24px;text-align:center;flex:1}
.stat-box .num{font-size:24px;font-weight:700}
.stat-box .lbl{font-size:11px;color:#a0a0a0;margin-top:4px}
.scenario{background:#16213e;border:1px solid #2a3a5e;border-radius:10px;padding:20px;margin:16px 0}
.scenario.pass{border-left:4px solid #4caf50}
.scenario.fail{border-left:4px solid #f44336}
.scenario.partial{border-left:4px solid #ff8c00}
.scenario.not-tested{border-left:4px solid #555}
.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600}
.pass-badge{background:#0d3320;color:#4caf50}
.fail-badge{background:#3a1a1a;color:#f44}
.partial-badge{background:#3a2a0a;color:#ff8c00}
.notes{background:#0a1a2a;border:1px solid #2a4a6e;border-radius:6px;padding:14px;margin:10px 0;font-size:13px;white-space:pre-wrap}
.evidence{margin:12px 0}
.evidence img{max-width:100%;border-radius:6px;margin:8px 0;border:1px solid #2a3a5e}
.evidence .file-link{display:inline-block;background:#0a1a2a;padding:6px 12px;border-radius:6px;font-size:12px;margin:4px;border:1px solid #2a4a6e}
footer{margin-top:40px;padding-top:20px;border-top:1px solid #2a3a5e;color:#555;font-size:11px}
</style></head><body>
<h1>📋 ${title}</h1>
<div class="meta">
  <strong>Reviewers:</strong> Nandan Tripathi (natripat), Kapil Chopra (kchopra)<br>
  <strong>Generated:</strong> ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} at ${new Date().toLocaleTimeString()}<br>
  <strong>Reference:</strong> <a href="https://learn.microsoft.com/en-ca/troubleshoot/microsoft-365/purview/diagnostics/purview-compliance-diagnostics" style="color:#4aa3f9">Microsoft Learn — Self-Help Diagnostics</a>
</div>
<div class="stat-row">
  <div class="stat-box"><div class="num" style="color:#0078d4">${scenarios.length}</div><div class="lbl">Total Scenarios</div></div>
  <div class="stat-box"><div class="num" style="color:#a0a0a0">${tested}</div><div class="lbl">Tested</div></div>
  <div class="stat-box"><div class="num" style="color:#4caf50">${passed}</div><div class="lbl">Passed</div></div>
  <div class="stat-box"><div class="num" style="color:#f44">${failed}</div><div class="lbl">Failed</div></div>
  <div class="stat-box"><div class="num" style="color:#ff8c00">${partial}</div><div class="lbl">Partial</div></div>
</div>

<h2>Test Results by Scenario</h2>`;

  scenarios.forEach(tp => {
    const ev = JSON.parse(localStorage.getItem('pg-evidence-'+tp.id) || '{}');
    const st = ev.status || 'not-tested';
    const badgeClass = st==='pass'?'pass-badge':st==='fail'?'fail-badge':st==='partial'?'partial-badge':'';
    const badgeText = st==='pass'?'✅ Pass':st==='fail'?'❌ Fail':st==='partial'?'⚠️ Partial':'⬜ Not Tested';

    rpt += `<div class="scenario ${st}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:15px">${tp.title}</h3>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      <p style="font-size:12px;color:#a0a0a0;margin:6px 0"><strong>Objective:</strong> ${tp.objective}</p>
      <p style="font-size:12px;color:#a0a0a0"><strong>Entry Point:</strong> ${tp.entryPoint}</p>`;

    if (ev.notes) {
      rpt += `<div class="notes"><strong>📝 Test Observations:</strong>\n${ev.notes}</div>`;
    }

    if (ev.files && ev.files.length > 0) {
      rpt += `<div class="evidence"><strong style="font-size:12px">📎 Evidence (${ev.files.length} files):</strong>`;
      ev.files.forEach(f => {
        if (f.type && f.type.startsWith('image/')) {
          rpt += '<div><img src="'+f.data+'" alt="'+f.name+'"><p style="font-size:11px;color:#707070">'+f.name+'</p></div>';
        } else if (f.type && f.type.startsWith('video/')) {
          rpt += '<div><video controls style="max-width:100%;border-radius:6px"><source src="'+f.data+'" type="'+f.type+'"></video><p style="font-size:11px;color:#707070">'+f.name+'</p></div>';
        } else {
          rpt += '<span class="file-link">📄 '+f.name+' ('+Math.round(f.size/1024)+'KB)</span>';
        }
      });
      rpt += `</div>`;
    }

    if (!ev.notes && (!ev.files || ev.files.length === 0) && st === 'not-tested') {
      rpt += `<p style="color:#555;font-size:12px;font-style:italic;margin-top:8px">Testing pending</p>`;
    }

    if (ev.timestamp) {
      rpt += `<p style="font-size:11px;color:#555;margin-top:8px">Last updated: ${new Date(ev.timestamp).toLocaleString()}</p>`;
    }

    rpt += `</div>`;
  });

  // Include custom scenarios in report
  const customScenarios = JSON.parse(localStorage.getItem('pg-custom-scenarios-'+product) || '[]');
  if (customScenarios.length > 0) {
    rpt += `<h2 style="margin-top:32px">🔍 Custom Observed Scenarios (${customScenarios.length})</h2>`;
    customScenarios.forEach(cs => {
      const cst = cs.status || 'not-tested';
      const csBadgeClass = cst==='pass'?'pass-badge':cst==='fail'?'fail-badge':cst==='partial'?'partial-badge':'';
      const csBadgeText = cst==='pass'?'✅ Pass':cst==='fail'?'❌ Fail':cst==='partial'?'⚠️ Partial':'⬜ Not Tested';
      rpt += `<div class="scenario ${cst}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3 style="margin:0;font-size:15px">🔍 ${cs.title}</h3>
          <span class="badge ${csBadgeClass}">${csBadgeText}</span>
        </div>
        <p style="font-size:12px;color:#a0a0a0"><strong>Type:</strong> Custom observation</p>`;
      if (cs.notes) {
        rpt += `<div class="notes"><strong>📝 Observations:</strong>\n${cs.notes}</div>`;
      }
      if (cs.files && cs.files.length > 0) {
        rpt += `<div class="evidence"><strong style="font-size:12px">📎 Evidence (${cs.files.length} files):</strong>`;
        cs.files.forEach(f => {
          if (f.type && f.type.startsWith('image/')) {
            rpt += '<div><img src="'+f.data+'" alt="'+f.name+'"><p style="font-size:11px;color:#707070">'+f.name+'</p></div>';
          } else if (f.type && f.type.startsWith('video/')) {
            rpt += '<div><video controls style="max-width:100%;border-radius:6px"><source src="'+f.data+'" type="'+f.type+'"></video><p style="font-size:11px;color:#707070">'+f.name+'</p></div>';
          } else {
            rpt += '<span class="file-link">📄 '+f.name+' ('+Math.round(f.size/1024)+'KB)</span>';
          }
        });
        rpt += `</div>`;
      }
      rpt += `<p style="font-size:11px;color:#555;margin-top:8px">Added: ${new Date(cs.timestamp).toLocaleString()}</p></div>`;
    });
  }

  rpt += `<footer>Generated from Purview Diagnostics Review Portal | ${new Date().toLocaleString()}</footer></body></html>`;
  downloadFile('purview-report-'+product+'.html', rpt, 'text/html');
}

function filterPGView(area) {
  const sections = document.querySelectorAll('.pg-area-section');
  sections.forEach(s => {
    s.style.display = (area === 'all' || s.dataset.area === area) ? 'block' : 'none';
  });
}

function filterPGStatus(status) {
  const cards = document.querySelectorAll('.pg-scenario-card');
  const extras = document.querySelectorAll('.pg-extra-section');
  cards.forEach(card => {
    const cardStatus = card.dataset.status;
    if (status === 'all') {
      card.style.display = 'block';
    } else if (status === 'tested') {
      card.style.display = (cardStatus && cardStatus !== 'not-tested') ? 'block' : 'none';
    } else if (status === 'not-tested') {
      card.style.display = (!cardStatus || cardStatus === 'not-tested') ? 'block' : 'none';
    } else {
      card.style.display = (cardStatus === status) ? 'block' : 'none';
    }
  });
  extras.forEach(el => { el.style.display = (status === 'all') ? 'block' : 'none'; });
}

// ==================== DATA ====================

const solutionsDiagnostics = [
  { id:'s1', area:'encryption', name:'Email encryption issues — licenses/settings', checks:'Checks license availability, IRM config, transport rules, encryption settings', cmdlet:'Test-IrmConfiguration', page:'Information Protection' },
  { id:'s2', area:'labels', name:'User can\'t find sensitivity label — policy check', checks:'Checks which labels available to user, label names, settings, availability', cmdlet:'Get-Label / Get-LabelPolicy', page:'Information Protection' },
  { id:'s3', area:'labels', name:'Autolabeling not applied to SPO/ODB file', checks:'Checks file properties, classification, whether autolabeling conditions met', cmdlet:'Test-DlpPolicies', page:'Information Protection' },
  { id:'s4', area:'dlp', name:'DLP rule not enforced for user — policy scope', checks:'Checks which DLP policies apply to user, policy names, where applied', cmdlet:'Get-DlpCompliancePolicy / Rule', page:'DLP' },
  { id:'s5', area:'dlp', name:'Endpoint DLP policy sync issues', checks:'Checks for policy sync issues, provides recommendations', cmdlet:'Get-DlpCompliancePolicy', page:'DLP' },
  { id:'s6', area:'dlp', name:'DLP alerts not working — rule configuration', checks:'Checks alerts, determines issues with DLP rule configuration', cmdlet:'Get-DlpCompliancePolicy / Rule', page:'DLP' },
  { id:'s7', area:'dlp', name:'Can\'t find alert for activity / audit event', checks:'Checks for alert related to activity/audit, investigates missing alert', cmdlet:'Get-DlpCompliancePolicy / Rule', page:'DLP' },
  { id:'s8', area:'dlp', name:'DLP rule not triggering for SPO/ODB file', checks:'Checks file properties, classification, DLP rule match', cmdlet:'Test-DlpPolicies', page:'DLP' },
  { id:'s9', area:'dlp', name:'Policy tips not appearing in OWA (HAR analysis)', checks:'Analyzes HAR file to investigate missing policy tips in Outlook on web', cmdlet:'Test-DlpPolicies', page:'DLP' },
  { id:'s10', area:'dlp', name:'DLP rule applied/not applied to Exchange email', checks:'Reviews message trace CSV for DLP rules applied to email', cmdlet:'Get-DlpCompliancePolicy + multiple', page:'DLP' },
];

const helpDiagnostics = [
  { id:'h1', area:'other', name:'Archive mailbox', checks:'Checks issues related to archive mailboxes', role:'Any admin', link:'https://aka.ms/PillarArchiveMailbox' },
  { id:'h2', area:'other', name:'Retention policy for user mailbox', checks:'Checks retention policy settings for a user mailbox', role:'Any admin', link:'https://aka.ms/PillarRetentionPolicy' },
  { id:'h3', area:'ediscovery', name:'Mailbox holds', checks:'Lists all holds on mailbox: retention, eDiscovery, app retention, delay', role:'Compliance admin', link:'https://aka.ms/PillarMailboxHoldsDiag' },
  { id:'h4', area:'ediscovery', name:'Grace eDiscovery hold / invalid retention', checks:'Identifies items preventing site deletion, option to remove holds', role:'Compliance admin', link:'https://aka.ms/PillarInvalidRetention' },
  { id:'h5', area:'other', name:'Compromised account', checks:'Identifies suspicious activities, provides recovery info', role:'Any admin', link:'https://aka.ms/diagca' },
  { id:'h6', area:'ediscovery', name:'eDiscovery RBAC', checks:'Checks eDiscovery RBAC — Search, Export, Preview roles assigned', role:'Any admin', link:'https://aka.ms/PillareDisRBACDiag' },
  { id:'h7', area:'dlp', name:'DLP policy & rule configuration (Help pane)', checks:'Troubleshoots common DLP policy/rule config issues across workloads', role:'Global admin', link:'https://aka.ms/PillarDLPPolicyConfig' },
  { id:'h8', area:'dlp', name:'DLP policy tips configuration (Help pane)', checks:'Troubleshoots policy tip config issues for Outlook desktop & OWA', role:'Global admin', link:'https://aka.ms/PillarDLPPolicyTipsDiag' },
  { id:'h9', area:'labels', name:'Sensitivity label configuration (Help pane)', checks:'Troubleshoots common sensitivity label issues across workloads', role:'Global admin', link:'https://aka.ms/PillarMipLabelDiag' },
  { id:'h10', area:'encryption', name:'Message Encryption configuration (Help pane)', checks:'Validates tenant config for Purview Message Encryption', role:'Any admin', link:'https://aka.ms/PillarOMEDiag' },
  { id:'h11', area:'other', name:'Validate Audit configuration', checks:'Validates general audit config, checks audit logs for a user', role:'Global admin', link:'https://aka.ms/PillarAuditConfigDiag' },
];

const gapData = [
  { area:'labels', issue:'Labels not appearing for users / policy sync delays', severity:'high', source:'Tech Community, Reddit', coverage:'covered', diagnostic:'User can\'t find sensitivity label', note:'Direct match — test if sync delay is surfaced' },
  { area:'labels', issue:'Auto-labeling cannot overwrite user-applied labels', severity:'high', source:'Practical365 (MVP)', coverage:'partial', diagnostic:'Autolabeling not applied to file', note:'Diagnostic checks evaluation but may not explain override limitation' },
  { area:'labels', issue:'External recipients can\'t open labeled/encrypted files', severity:'high', source:'Tech Community (2,200 views)', coverage:'gap', diagnostic:'None — no cross-tenant B2B validation', note:'Suggested: "Validate cross-tenant access for label encryption"' },
  { area:'labels', issue:'Labels break OneDrive external sharing without encryption', severity:'medium', source:'Tech Community (446 views)', coverage:'gap', diagnostic:'None', note:'Sharing + label interaction not covered' },
  { area:'labels', issue:'MIP SDK breaking changes — "Could not find template"', severity:'medium', source:'Stack Overflow', coverage:'gap', diagnostic:'None — SDK/developer scenarios not covered', note:'Developer audience not targeted by current diagnostics' },
  { area:'labels', issue:'Mandatory labeling blocks automation (Excel Interop, VBA)', severity:'medium', source:'Stack Overflow (606 views)', coverage:'gap', diagnostic:'None', note:'Automation/programmatic scenarios not covered' },
  { area:'labels', issue:'Dynamic watermarking breaks access for older Office', severity:'medium', source:'Practical365', coverage:'gap', diagnostic:'None', note:'Client version compatibility not checked' },
  { area:'labels', issue:'Graph API returns 400 retrieving labels', severity:'medium', source:'Stack Overflow (761 views)', coverage:'gap', diagnostic:'None — API scenarios not covered', note:'Developer/API troubleshooting gap' },
  { area:'encryption', issue:'External users can\'t open encrypted attachments (CA + RMS conflict)', severity:'critical', source:'Tech Community Blog', coverage:'partial', diagnostic:'Email encryption diagnostic', note:'Checks IRM but NOT Conditional Access policies — biggest gap' },
  { area:'encryption', issue:'Encrypt-Only unreadable after Outlook 2511 update (confirmed bug)', severity:'critical', source:'Microsoft Support', coverage:'gap', diagnostic:'None — known bug, no diagnostic', note:'Diagnostic could flag known active bugs' },
  { area:'encryption', issue:'"Encrypt-Only" silently applies "Do Not Forward"', severity:'high', source:'Tech Community (832 views)', coverage:'gap', diagnostic:'None — template mismatch not detected', note:'Suggested: "Verify encryption template matches intended config"' },
  { area:'encryption', issue:'Encryption disappears on forwarded emails', severity:'high', source:'Tech Community', coverage:'gap', diagnostic:'None — label inheritance not checked', note:'Suggested: "Check encryption persistence across email thread"' },
  { area:'encryption', issue:'Default encrypted label — no warning sending externally', severity:'medium', source:'Tech Community', coverage:'gap', diagnostic:'None', note:'UX/policy design gap' },
  { area:'encryption', issue:'External recipients blocked — "account does not exist"', severity:'high', source:'Tech Community (2,200 views)', coverage:'partial', diagnostic:'Email encryption diagnostic', note:'IRM check partial — B2B/guest auth not validated' },
  { area:'encryption', issue:'OME format change (message_v2.rpmsg) breaking non-M365', severity:'high', source:'Tech Community (1,200 views)', coverage:'gap', diagnostic:'None — format compatibility not checked', note:'Could detect recipient compatibility issues' },
  { area:'encryption', issue:'Domain-specific label permissions cross-tenant auth failure', severity:'medium', source:'Tech Community', coverage:'gap', diagnostic:'None', note:'Cross-tenant scope permissions not validated' },
  { area:'dlp', issue:'DLP alerts silently disabled after Sept 2025 change', severity:'critical', source:'m365admin.handsontek.net', coverage:'partial', diagnostic:'DLP alerts not working', note:'Checks config but may not detect PS vs portal sync issue' },
  { area:'dlp', issue:'Endpoint DLP doesn\'t work scoped to user groups', severity:'critical', source:'Tech Community', coverage:'partial', diagnostic:'Endpoint DLP policy sync', note:'Checks sync but not scoping limitation' },
  { area:'dlp', issue:'Files from network shares bypass Endpoint DLP', severity:'critical', source:'Tech Community', coverage:'gap', diagnostic:'None — known limitation not surfaced', note:'Suggested: "Check Network Share Coverage for Endpoint DLP"' },
  { area:'dlp', issue:'Policy tips not showing (9 root causes; Mac unsupported)', severity:'high', source:'Microsoft Docs, blogs', coverage:'covered', diagnostic:'Policy tips diagnostic + HAR analysis', note:'Well covered but Mac limitation not proactively flagged' },
  { area:'dlp', issue:'Policy sync/propagation delays (2-24 hours)', severity:'high', source:'Spiceworks, Tech Community', coverage:'covered', diagnostic:'Endpoint DLP policy sync', note:'Direct match — test if timeline/status detail shown' },
  { area:'dlp', issue:'"Devices" location missing from DLP policy (licensing/role)', severity:'high', source:'Reddit r/sysadmin', coverage:'partial', diagnostic:'DLP policy config', note:'May detect config issue but not licensing/role root cause' },
  { area:'dlp', issue:'False positives from built-in SIT templates', severity:'medium', source:'Tech Community, blogs', coverage:'gap', diagnostic:'None — SIT tuning not covered', note:'No diagnostic for SIT accuracy/tuning' },
  { area:'dlp', issue:'False positive reporting invisible to admins', severity:'medium', source:'Tech Community', coverage:'gap', diagnostic:'None — no admin dashboard', note:'Suggested: "Show false positive reports submitted by users"' },
];

const scenarios = [
  { id:'sc1', area:'labels', priority:'high', title:'Label Not Visible to User — Remove from Policy', breakSteps:['Edit label policy → remove test user from scope','Wait 15-30 min for propagation','Log in as test user, check if label appears'], diagnostic:'User can\'t find sensitivity label (Solutions)', diagnosticSteps:['Go to Info Protection → Diagnostics','Select "User can\'t find sensitivity label"','Enter affected user email','Run diagnostic'], expectedResult:'Should detect user NOT in label policy scope.', gradeQuestions:['Identifies missing policy assignment?','Names which policy to fix?','Clear for non-technical admin?','Links to documentation?'] },
  { id:'sc2', area:'labels', priority:'high', title:'Auto-Label Mismatch — File Doesn\'t Meet Conditions', breakSteps:['Create label with auto-labeling (e.g., Credit Card SIT)','Upload file WITHOUT matching content to SPO','Wait for evaluation','Verify label NOT applied'], diagnostic:'Autolabeling not applied to file (Solutions)', diagnosticSteps:['Select "Autolabeling not applied"','Enter full file path','Run diagnostic'], expectedResult:'Should explain file didn\'t meet conditions and show which were checked.', gradeQuestions:['Explains WHY not applied?','Shows SIT conditions evaluated?','Tells what content to add?','File path guidance clear?'] },
  { id:'sc3', area:'labels', priority:'high', title:'Encryption Label — External Access Blocked', breakSteps:['Create label with "All org users" encryption','Apply to OneDrive doc','Share with external user','External user tries to open'], diagnostic:'Email encryption + Sensitivity label config', diagnosticSteps:['Run both encryption and label diagnostics','Check if either flags external access issue'], expectedResult:'Current gap: Neither validates cross-tenant B2B access.', gradeQuestions:['Detects external access problem?','Suggests B2B settings?','Mentions Azure AD cross-tenant?','Customer knows what to fix?'] },
  { id:'sc4', area:'encryption', priority:'critical', title:'IRM Disabled — Break Azure RMS', breakSteps:['PowerShell: Set-IRMConfiguration -AzureRMSLicensingEnabled $false','Wait a few minutes','Send encrypted email — verify failure'], diagnostic:'Email encryption — licenses/settings (Solutions)', diagnosticSteps:['Select "Email encryption not working"','Run diagnostic'], expectedResult:'Should detect IRM/Azure RMS disabled and recommend re-enabling.', gradeQuestions:['Detects IRM disabled?','Provides fix command?','Checks license too?','Clear error description?'], cleanup:'Set-IRMConfiguration -AzureRMSLicensingEnabled $true' },
  { id:'sc5', area:'encryption', priority:'critical', title:'OME Template Mismatch — Encrypt-Only vs DNF', breakSteps:['Create mail flow rule with "Encrypt" template','Send test email triggering rule','Check: is it Encrypt-Only or Do Not Forward?'], diagnostic:'Email encryption + Message Encryption config', diagnosticSteps:['Run encryption diagnostic from Solutions','Run OME diagnostic from Help pane','Compare outputs'], expectedResult:'Gap: Likely won\'t detect template mismatch.', gradeQuestions:['Shows which template applied?','Compares intended vs actual?','Detects Encrypt→DNF switch?','Suggests checking mail flow rules?'] },
  { id:'sc6', area:'encryption', priority:'high', title:'Message Encryption Config — Tenant Check', breakSteps:['Non-destructive: run diagnostic against current config','Document current encryption state'], diagnostic:'Message Encryption configuration (Help pane)', diagnosticSteps:['M365 Admin → Help → "message encryption"','Run diagnostic','Document all checks and results'], expectedResult:'Should validate complete OME configuration.', gradeQuestions:['What checks performed?','Checks transport rules?','Validates certificates?','Results actionable?'] },
  { id:'sc7', area:'dlp', priority:'critical', title:'DLP Not Enforcing — Remove User from Scope', breakSteps:['Edit DLP policy → exclude test user','Wait for propagation (up to 1 hour)','Share sensitive file as that user','Verify DLP does NOT trigger'], diagnostic:'DLP rule not enforced for user (Solutions)', diagnosticSteps:['Select "DLP rule not enforced for user"','Enter user email + policy name','Run diagnostic'], expectedResult:'Should detect user excluded from policy scope.', gradeQuestions:['Identifies user exclusion?','Shows which policy/rule?','Recommends re-adding user?','Understandable without DLP expertise?'], cleanup:'Re-add user to DLP policy' },
  { id:'sc8', area:'dlp', priority:'critical', title:'DLP Alerts Disabled — Modify Alert Config', breakSteps:['Get-DlpComplianceRule | note GenerateAlert settings','Set-DlpComplianceRule -Identity "Rule" -GenerateAlert $null','Trigger rule → verify no alert generated'], diagnostic:'DLP alerts not working (Solutions)', diagnosticSteps:['Select "Alerts not working for DLP rule"','Enter rule/policy name','Run diagnostic'], expectedResult:'Should detect GenerateAlert is disabled/null.', gradeQuestions:['Detects missing alert config?','Shows PS vs Portal sync diff?','References Sept 2025 change?','Provides exact PS fix command?'], cleanup:'Set-DlpComplianceRule -Identity "Rule" -GenerateAlert SiteAdmin' },
  { id:'sc9', area:'dlp', priority:'high', title:'DLP File — Wrong Path vs Sharing Link', breakSteps:['Upload sensitive file to SharePoint','Note full path AND sharing link','Wait for DLP scan'], diagnostic:'DLP rule not triggering for file (Solutions)', diagnosticSteps:['Select "DLP rule not triggering for file"','Try SHARING LINK first (should fail)','Then try FULL FILE PATH','Compare results'], expectedResult:'Should work with full path. Sharing link should give clear error.', gradeQuestions:['Explains path vs link difference?','What happens with sharing link?','Shows which rules evaluated?','Explains match/no-match?'] },
  { id:'sc10', area:'dlp', priority:'high', title:'Endpoint DLP Sync — Device Check', breakSteps:['Create/modify Endpoint DLP policy','Check test device sync status','Optionally disconnect/reconnect network'], diagnostic:'Endpoint DLP policy sync (Solutions)', diagnosticSteps:['Select "Endpoint DLP not working — sync issues"','Enter device/user info','Run diagnostic'], expectedResult:'Should detect sync delay and provide timeline.', gradeQuestions:['Shows last sync timestamp?','Sync status per policy?','Suggests remediation?','Accounts for network issues?'] },
  { id:'sc11', area:'dlp', priority:'high', title:'Policy Tips Missing in OWA — HAR Analysis', breakSteps:['Create DLP policy with tips for OWA','Compose email with triggering content','F12 → Network → Preserve log → export HAR'], diagnostic:'Policy tips in OWA — HAR analysis (Solutions)', diagnosticSteps:['Select "Policy tips don\'t appear in OWA"','Upload HAR file','Run diagnostic'], expectedResult:'Should analyze HAR and identify why tips not showing.', gradeQuestions:['HAR capture instructions clear?','Explains findings?','Covers 9 known causes?','Mentions Mac unsupported?'] },
  { id:'sc12', area:'dlp', priority:'critical', title:'Network Share Bypass — Endpoint DLP Limitation', breakSteps:['Enable Endpoint DLP on test device','Create policy scoped to endpoints','Copy sensitive file FROM network share','Check if DLP blocks action'], diagnostic:'Endpoint DLP diagnostic (Solutions)', diagnosticSteps:['Run Endpoint DLP diagnostic','Note if it mentions network shares','Check for known limitation flagging'], expectedResult:'Gap: Likely won\'t mention network share bypass.', gradeQuestions:['Mentions network share scope?','Warns about limitations?','Customer would discover this?','Should there be separate diagnostic?'] },
  { id:'sc13', area:'labels', priority:'high', title:'Label Config — Help Pane Diagnostic', breakSteps:['Misconfigure a label (conflicting scope, disabled workload)','Publish via policy'], diagnostic:'Sensitivity label configuration (Help pane)', diagnosticSteps:['M365 Admin → Help → "sensitivity label"','Run diagnostic','Enter label name'], expectedResult:'Should detect misconfiguration and recommend fixes.', gradeQuestions:['Detects intentional misconfig?','Checks all workloads?','Compares to Solutions page?','Help pane UX intuitive?'] },
  { id:'sc14', area:'dlp', priority:'high', title:'DLP Config — Help Pane vs Solutions Comparison', breakSteps:['Create DLP policy with intentional issue (no locations)','Save policy'], diagnostic:'DLP policy & rule config (Help pane)', diagnosticSteps:['Run Help pane diagnostic (Admin → Help → "DLP")','Run Solutions page equivalent','Compare outputs'], expectedResult:'Compare: which is more thorough? Redundant or complementary?', gradeQuestions:['Which gives better detail?','Check same things?','Customer knows which to use?','Help pane requires Global Admin?'] },
  { id:'sc15', area:'dlp', priority:'medium', title:'DLP Exchange Email — Message Trace Analysis', breakSteps:['Send email with sensitive content between test users','Exchange Admin → Message trace → export CSV'], diagnostic:'DLP rule applied/not applied to Exchange email (Solutions)', diagnosticSteps:['Select "DLP rule applied/not applied to email"','Upload message trace CSV','Run diagnostic'], expectedResult:'Should analyze trace and show which rules evaluated.', gradeQuestions:['Message trace instructions clear?','Parses CSV correctly?','Shows per-rule results?','Explains matched & unmatched?'] },
];

const improvements = [
  { title:'Replace Open-Ended Intake with Decision Tree', priority:'P0', problem:'Agent asks "How can I help?" forcing keyword guessing.', solution:'Present clickable categories → sub-categories → auto-run diagnostic.', impact:'Reduces time-to-resolution by 60%+' },
  { title:'Ask Objective Questions, Not Subjective', priority:'P0', problem:'Subjective questions yield unpredictable answers agent can\'t process.', solution:'Use yes/no, multiple-choice, specific inputs (email, policy name, file path).', impact:'Enables automated diagnostic runs.' },
  { title:'Show Results with Actionable Next Steps', priority:'P1', problem:'Diagnostics tell what\'s wrong but not how to fix.', solution:'Every result: what checked → what found → steps to fix → doc link.', impact:'Reduces ticket escalation.' },
  { title:'Surface Known Limitations Proactively', priority:'P1', problem:'Known issues (Mac, network shares, version bugs) not surfaced.', solution:'Detect client OS/version, check active known bugs, warn about unsupported.', impact:'Prevents wasted troubleshooting.' },
  { title:'Cross-Reference Related Diagnostics', priority:'P2', problem:'Labels + Encryption + DLP overlap but diagnostics are siloed.', solution:'When one diagnostic finds issue, suggest related ones.', impact:'Catches multi-component issues.' },
  { title:'Unify Solutions Page vs Help Pane', priority:'P2', problem:'Two entry points with different capabilities. Customers confused.', solution:'Either unify or add clear guidance with auto-redirect.', impact:'Eliminates path confusion.' },
];

// ==================== TEST SCENARIOS (DETAILED) ====================

const testPlans = [
  // --- SENSITIVITY LABELS (5 scenarios) ---
  {
    id:'tp-lbl-1', area:'labels',
    title:'Label Not Published to User — Policy Scope Validation',
    objective:'Verify the diagnostic correctly identifies when a user is NOT included in a sensitivity label policy.',
    entryPoint:'Solutions → Information Protection → Diagnostics → "User can\'t find sensitivity label"',
    cmdlet:'Get-Label / Get-LabelPolicy',
    prereqs:['Active sensitivity label policy with specific user scope','Test user NOT in the policy scope','Admin role: Compliance or Security Administrator'],
    steps:['Sign in to Purview portal as admin','Go to Solutions → Information Protection → Diagnostics','Select "A user can\'t find the sensitivity label they need. Does the label policy apply to them?"','Enter the test user email address','Click Run Tests','Review results'],
    expectedGood:'Diagnostic should: (1) Identify that user is NOT assigned to any label policy, (2) Name the existing policies, (3) Suggest adding user to specific policy, (4) Link to label policy docs',
    expectedBad:'Diagnostic says "No issues found" or gives generic advice without naming policies',
    gradeChecklist:['Correctly identifies user not in policy scope?','Names which policies exist?','Provides actionable fix?','Links to documentation?','Clear for non-technical admin?']
  },
  {
    id:'tp-lbl-2', area:'labels',
    title:'Label Priority Conflict — Multiple Policies with Same User',
    objective:'Test if the diagnostic detects conflicting label policies when a user belongs to multiple policies with different label sets.',
    entryPoint:'Solutions → Information Protection → Diagnostics → "User can\'t find sensitivity label"',
    cmdlet:'Get-Label / Get-LabelPolicy',
    prereqs:['Two label policies scoped to same user with different labels','Policies set at different priority levels','Admin role: Compliance Administrator'],
    steps:['Create Policy A (priority 0) with labels: Confidential, Internal','Create Policy B (priority 1) with labels: Secret, Top Secret','Add same test user to both policies','Run diagnostic for that user','Check if all 4 labels are listed or only highest-priority policy wins'],
    expectedGood:'Diagnostic shows ALL labels from ALL applicable policies with their priority order, explains which policy takes precedence if conflicts exist',
    expectedBad:'Only shows labels from one policy, or doesn\'t explain priority resolution',
    gradeChecklist:['Lists labels from all applicable policies?','Shows policy priority/order?','Explains how conflicts resolve?','Mentions policy inheritance?','Accurate label-to-policy mapping?']
  },
  {
    id:'tp-lbl-3', area:'labels',
    title:'Auto-Labeling Not Triggering — File Content Doesn\'t Match SIT',
    objective:'Validate that diagnostic explains WHY auto-labeling didn\'t apply to a file that appears to have sensitive content.',
    entryPoint:'Solutions → Information Protection → Diagnostics → "Autolabeling not applied to SPO/ODB file"',
    cmdlet:'Test-DlpPolicies',
    prereqs:['Auto-labeling policy with SIT condition (e.g., Credit Card Number)','File in SharePoint with content that ALMOST matches (e.g., 15-digit number instead of 16)','Full file path (not sharing link)'],
    steps:['Upload file with near-miss content to SharePoint','Wait for auto-labeling evaluation (up to 7 days for simulation)','Go to Information Protection → Diagnostics','Select "Autolabeling isn\'t applied to a SharePoint or OneDrive file"','Enter FULL file path (not sharing link)','Run diagnostic'],
    expectedGood:'Diagnostic should: (1) Confirm file was evaluated, (2) List SIT conditions checked, (3) Explain which condition failed and why, (4) Clarify path vs sharing link requirement',
    expectedBad:'Says "file not found" with sharing link, or just says "conditions not met" without specifics',
    gradeChecklist:['Accepts full path correctly?','Explains which SIT conditions evaluated?','Shows why match failed?','Mentions confidence level thresholds?','Path guidance clear in UI?']
  },
  {
    id:'tp-lbl-4', area:'labels',
    title:'Label Available in Outlook but Not in Word — Workload Scoping',
    objective:'Test if the diagnostic identifies when a label is scoped to specific workloads (e.g., email only, not files).',
    entryPoint:'Help Pane → M365 Admin Center → "sensitivity label" OR Solutions → Info Protection → Diagnostics',
    cmdlet:'Get-Label / Get-LabelPolicy',
    prereqs:['Sensitivity label configured for "Email" scope only (not "Files")','User in the label policy','Label visible in Outlook but missing in Word/Excel/PowerPoint'],
    steps:['Configure label with scope set to only "Email"','Publish via label policy to test user','Verify label appears in Outlook','Verify label does NOT appear in Word','Run diagnostic: "User can\'t find sensitivity label"','Check if workload scoping is flagged'],
    expectedGood:'Diagnostic identifies label exists but is scoped to specific workloads. Shows workload assignments and suggests expanding scope if needed.',
    expectedBad:'Says label is assigned to user (technically true) without mentioning the workload scope limitation',
    gradeChecklist:['Detects workload-specific scope?','Distinguishes "label exists" from "label available in X app"?','Shows workload assignments?','Suggests resolution?','Covers Office apps + Outlook separately?']
  },
  {
    id:'tp-lbl-5', area:'labels',
    title:'Help Pane vs Solutions Page — Same Query, Compare Results',
    objective:'Compare diagnostic results when testing the same label issue from Help Pane (M365 Admin Center) vs Solutions page (Purview portal).',
    entryPoint:'BOTH: M365 Admin Help Pane AND Purview Solutions → Info Protection → Diagnostics',
    cmdlet:'Sensitivity label configuration (Help) vs Get-Label (Solutions)',
    prereqs:['A known label issue (e.g., label not visible to user)','Access to M365 Admin Center (Global Admin for Help pane)','Access to Purview portal (Compliance Admin for Solutions)'],
    steps:['First: M365 Admin → Help icon → type "sensitivity label not showing" → run diagnostic','Record: what questions asked, what checks run, what results shown','Second: Purview → Info Protection → Diagnostics → "User can\'t find label" → run','Record: same details','Compare the two experiences side-by-side'],
    expectedGood:'Both provide useful and complementary information. Clear when to use which.',
    expectedBad:'One is clearly inferior or they provide conflicting results',
    gradeChecklist:['Which entry point gives more detail?','Do they check the same things?','Results consistent between both?','Role requirements different — mentioned?','Customer knows which to use when?']
  },

  // --- EMAIL ENCRYPTION (5 scenarios) ---
  {
    id:'tp-enc-1', area:'encryption',
    title:'IRM Configuration Disabled — License and Settings Check',
    objective:'Verify diagnostic detects when Azure Rights Management (IRM) is disabled at tenant level.',
    entryPoint:'Solutions → Information Protection → Diagnostics → "Email encryption isn\'t working"',
    cmdlet:'Test-IrmConfiguration',
    prereqs:['Access to disable IRM via PowerShell: Set-IRMConfiguration -AzureRMSLicensingEnabled $false','Admin role: Compliance or Security Administrator','Test email account to verify encryption failure'],
    steps:['Run: Set-IRMConfiguration -AzureRMSLicensingEnabled $false','Wait 5-10 minutes for propagation','Try sending encrypted email — confirm it fails','Go to Info Protection → Diagnostics','Select "Email encryption isn\'t working as expected. Are there any issues that affect my licenses or settings?"','Run diagnostic'],
    expectedGood:'Diagnostic should: (1) Detect IRM disabled, (2) Show the specific setting, (3) Provide PowerShell command to re-enable, (4) Check license status too',
    expectedBad:'Says "no issues found" or only checks licenses without checking IRM config state',
    gradeChecklist:['Detects IRM disabled state?','Provides exact fix (PowerShell command)?','Also checks license availability?','Checks transport rule conflicts?','Clear severity indication?'],
    cleanup:'Set-IRMConfiguration -AzureRMSLicensingEnabled $true'
  },
  {
    id:'tp-enc-2', area:'encryption',
    title:'Missing Encryption License — User Without E5/AIP P1',
    objective:'Test if diagnostic identifies when a user lacks the required license for message encryption.',
    entryPoint:'Solutions → Information Protection → Diagnostics → "Email encryption isn\'t working"',
    cmdlet:'Test-IrmConfiguration',
    prereqs:['Test user with only E1 or E3 license (no AIP P1 add-on)','Mail flow rule or label requiring encryption','Admin role: Compliance Administrator'],
    steps:['Identify or create test user with E1/E3 only','Assign them to a policy requiring encryption','Have them try to send encrypted email','Run diagnostic from Info Protection → Diagnostics','Select "Email encryption — licenses/settings"','Enter affected user if prompted'],
    expectedGood:'Diagnostic flags missing license for that specific user, names which license needed (E5 or AIP P1), links to license assignment page',
    expectedBad:'Generic "encryption is configured correctly" because tenant HAS licenses even though specific user doesn\'t',
    gradeChecklist:['Checks per-user license (not just tenant)?','Names the required SKU?','Distinguishes user vs tenant licensing?','Links to license assignment?','Mentions trial/add-on options?']
  },
  {
    id:'tp-enc-3', area:'encryption',
    title:'Transport Rule Overriding Encryption — Rule Conflict',
    objective:'Validate if the diagnostic detects when a transport rule removes or overrides encryption applied by a sensitivity label.',
    entryPoint:'Solutions → Information Protection → Diagnostics → "Email encryption isn\'t working"',
    cmdlet:'Test-IrmConfiguration',
    prereqs:['Sensitivity label with "Encrypt" action','Transport rule with "Remove OME" or "Decrypt" action','Both in scope for same email flow'],
    steps:['Create label that applies encryption','Create transport rule that strips encryption for specific domain/condition','Send email triggering both (label applied + transport rule matches)','Verify email arrives unencrypted','Run diagnostic: "Email encryption isn\'t working"','Check if rule conflict is identified'],
    expectedGood:'Diagnostic identifies transport rule conflict, names the conflicting rule, explains precedence, suggests resolution',
    expectedBad:'Says encryption is configured correctly because label and IRM are fine — doesn\'t check transport rules',
    gradeChecklist:['Checks transport rules for conflicts?','Identifies specific conflicting rule?','Explains rule precedence?','Suggests fix (modify rule or label)?','Covers both EAC and PowerShell rules?']
  },
  {
    id:'tp-enc-4', area:'encryption',
    title:'OME Configuration Validation — Help Pane Diagnostic',
    objective:'Run the Message Encryption diagnostic from Help Pane and validate completeness of checks.',
    entryPoint:'Help Pane → M365 Admin Center → search "message encryption"',
    cmdlet:'Microsoft Purview Message Encryption configuration diagnostic',
    prereqs:['Current encryption configuration (don\'t break anything)','Global Admin or any M365 admin role','Access to M365 Admin Center'],
    steps:['Go to M365 Admin Center','Click Help icon (top right)','Type "message encryption configuration" or "OME"','Select the diagnostic when offered','Run Tests','Document ALL checks performed and results'],
    expectedGood:'Comprehensive validation: checks OME template, IRM config, transport rules, certificates, Azure RMS status',
    expectedBad:'Only checks one or two things, provides generic "looks good" without details',
    gradeChecklist:['What specific checks does it perform?','Checks transport rule interactions?','Validates certificate/template status?','Results detailed or vague?','Actionable if issues found?']
  },
  {
    id:'tp-enc-5', area:'encryption',
    title:'External Recipient Can\'t Decrypt — Cross-Tenant Scenario',
    objective:'Test if encryption diagnostics address the common scenario where external recipients cannot open encrypted emails.',
    entryPoint:'Solutions → Information Protection → Diagnostics + Help Pane',
    cmdlet:'Test-IrmConfiguration',
    prereqs:['Encrypted email sent to external (non-M365) recipient','Recipient reports "this message is encrypted" but cannot authenticate','Recipient\'s mail system: Gmail, Yahoo, or on-prem Exchange'],
    steps:['Send encrypted email to external Gmail/Yahoo recipient','Confirm they receive the wrapper message','Confirm they have issues authenticating or viewing','Run diagnostic from Solutions page: "Email encryption isn\'t working"','Also run from Help pane: search "encryption"','Check if either diagnostic addresses external recipient scenarios'],
    expectedGood:'Diagnostic acknowledges external delivery, checks OME portal availability, validates B2B/guest settings, mentions one-time passcode option',
    expectedBad:'Only checks internal config — doesn\'t consider external recipient experience at all',
    gradeChecklist:['Addresses external recipient scenario?','Checks B2B/guest auth settings?','Mentions one-time passcode?','Validates OME portal availability?','Suggests recipient-side troubleshooting?']
  },

  // --- DLP POLICIES (5 scenarios) ---
  {
    id:'tp-dlp-1', area:'dlp',
    title:'DLP Policy Not Enforcing for Specific User — Scope Check',
    objective:'Validate that the diagnostic correctly identifies when a user is excluded from or not included in a DLP policy scope.',
    entryPoint:'Solutions → Data Loss Prevention → Diagnostics → "DLP rule not enforced for user"',
    cmdlet:'Get-DlpCompliancePolicy / Get-DlpComplianceRule',
    prereqs:['DLP policy with user/group scope (not "All")','Test user explicitly excluded from policy','Sensitive content available for testing','Admin role: Compliance Administrator or DLP Compliance Management'],
    steps:['Edit DLP policy → exclude test user from scope','Wait for policy propagation (up to 1 hour)','As test user, share file with credit card numbers in SharePoint','Verify DLP does NOT block or alert','Go to DLP → Diagnostics → "A DLP rule isn\'t enforced for a particular user"','Enter user email and policy name','Run diagnostic'],
    expectedGood:'Diagnostic identifies user is excluded, names the exclusion group/setting, shows which policies DO apply to user, suggests re-adding',
    expectedBad:'Says "policy is configured correctly" without checking user-level scope',
    gradeChecklist:['Detects user exclusion?','Names the specific exclusion setting?','Shows all policies and user\'s scope status?','Provides fix action?','Explains propagation delay?'],
    cleanup:'Remove user exclusion from DLP policy'
  },
  {
    id:'tp-dlp-2', area:'dlp',
    title:'DLP Alert Not Triggering — Alert Configuration Issue',
    objective:'Test if the diagnostic detects when DLP alerts are misconfigured (GenerateAlert set to null or wrong value).',
    entryPoint:'Solutions → Data Loss Prevention → Diagnostics → "Alerts aren\'t working for a DLP rule"',
    cmdlet:'Get-DlpCompliancePolicy / Get-DlpComplianceRule',
    prereqs:['DLP policy with alerts configured','PowerShell access to modify: Set-DlpComplianceRule','Test content to trigger the rule','Admin role: Compliance Administrator'],
    steps:['Run: Get-DlpComplianceRule | FL Name, GenerateAlert — document current state','Run: Set-DlpComplianceRule -Identity "RuleName" -GenerateAlert $null','Trigger the DLP rule with test content','Verify NO alert generated in DLP Alerts dashboard','Run diagnostic: "Alerts aren\'t working for a DLP rule"','Enter rule/policy name'],
    expectedGood:'Diagnostic detects GenerateAlert is null/empty, names the specific rule, provides PowerShell command to fix, mentions Sept 2025 portal bug that caused this',
    expectedBad:'Says alerts are configured or only checks policy-level settings',
    gradeChecklist:['Detects null/empty GenerateAlert?','Checks rule-level (not just policy)?','Provides exact fix command?','Mentions known PS vs portal sync issue?','Tests actual alert delivery?'],
    cleanup:'Set-DlpComplianceRule -Identity "RuleName" -GenerateAlert SiteAdmin'
  },
  {
    id:'tp-dlp-3', area:'dlp',
    title:'DLP Rule Not Triggering for SharePoint File — File Path Analysis',
    objective:'Validate the file-level DLP diagnostic correctly evaluates a file path and explains rule match/no-match.',
    entryPoint:'Solutions → Data Loss Prevention → Diagnostics → "DLP rule not triggering for file"',
    cmdlet:'Test-DlpPolicies',
    prereqs:['File with sensitive content in SharePoint/OneDrive','Active DLP policy covering SharePoint location','Both full file path AND sharing link for comparison testing'],
    steps:['Upload file with credit card numbers to SharePoint','Note the FULL path (Sites/sitename/library/filename.xlsx)','Also copy the sharing link','Go to DLP → Diagnostics → "DLP rule isn\'t triggering for a file in SPO/ODB"','FIRST try entering the sharing link — document what happens','THEN try entering the full file path — document results','Compare behaviors'],
    expectedGood:'With full path: shows file properties, which rules evaluated, match/no-match per rule with reasons. With sharing link: clear error message explaining to use full path instead.',
    expectedBad:'Sharing link silently fails or gives cryptic error. Full path gives only pass/fail without details.',
    gradeChecklist:['Sharing link gives clear error message?','Full path returns detailed analysis?','Shows which DLP rules were evaluated?','Explains match vs no-match per rule?','Path guidance in the UI sufficient?']
  },
  {
    id:'tp-dlp-4', area:'dlp',
    title:'Endpoint DLP Policy Sync Failure — Device Compliance Check',
    objective:'Test if the diagnostic identifies policy sync issues on endpoint devices and provides timeline/recommendations.',
    entryPoint:'Solutions → Data Loss Prevention → Diagnostics → "Endpoint DLP isn\'t working — policy sync"',
    cmdlet:'Get-DlpCompliancePolicy',
    prereqs:['Endpoint DLP policy enabled','Test device onboarded to Microsoft Purview','Admin role: Compliance Administrator','Device with known sync delay (newly onboarded or after policy change)'],
    steps:['Create or modify an Endpoint DLP policy','Note the time of modification','Check test device immediately (should not have new policy yet)','Run diagnostic: "Endpoint DLP isn\'t working as expected — policy sync issues"','Enter device or user information','Document: what sync checks performed, timeline shown, recommendations given'],
    expectedGood:'Diagnostic shows: last sync time, current policy version on device vs cloud, expected sync timeline, specific recommendations if out of sync',
    expectedBad:'Generic "wait for sync" advice without specific device status or timeline',
    gradeChecklist:['Shows last sync timestamp?','Compares device vs cloud policy version?','Provides expected sync timeline?','Gives specific troubleshooting if stuck?','Accounts for network/connectivity issues?']
  },
  {
    id:'tp-dlp-5', area:'dlp',
    title:'DLP Policy Tips Missing in OWA — HAR File Analysis',
    objective:'Validate the HAR analysis diagnostic for missing policy tips in Outlook on the web.',
    entryPoint:'Solutions → Data Loss Prevention → Diagnostics → "Policy tips don\'t appear in Outlook on the web"',
    cmdlet:'Test-DlpPolicies',
    prereqs:['DLP policy with policy tips enabled for Exchange','OWA access (Outlook on the web)','F12 Developer Tools capability','Email content that should trigger DLP tip'],
    steps:['Open OWA in browser','Press F12 → Network tab → check "Preserve log"','Compose email with content that should trigger DLP policy tip','Observe if tip appears (it shouldn\'t for this test — misconfigure tip display)','Export HAR file from Network tab','Go to DLP → Diagnostics → "Policy tips don\'t appear in OWA"','Upload the HAR file','Run diagnostic'],
    expectedGood:'Diagnostic parses HAR, identifies specific API calls related to DLP evaluation, pinpoints failure reason (9 known causes), provides targeted fix',
    expectedBad:'Just says "upload HAR file" without explaining how to capture it, or gives generic results after analysis',
    gradeChecklist:['HAR capture instructions clear in UI?','Parses uploaded HAR successfully?','Identifies specific failure cause?','Covers all 9 known tip display issues?','Mentions Mac/non-Chromium unsupported?']
  }
];

// ==================== NAVIGATION ====================

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');
  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? '' : 'dark');
  document.querySelector('.theme-toggle').textContent = isDark ? '🌙' : '☀️';
  localStorage.setItem('purview-theme', isDark ? 'light' : 'dark');
}

// ==================== HELPERS ====================

function areaColor(a) { return {labels:'blue',encryption:'orange',dlp:'green',ediscovery:'purple',other:'gray'}[a]||'gray'; }
function areaLabel(a) { return {labels:'Labels',encryption:'Encryption',dlp:'DLP',ediscovery:'eDiscovery',other:'Other'}[a]||a; }
function severityIcon(s) { return {critical:'🔴',high:'🟠',medium:'🟡'}[s]||'⚪'; }
function coverageBadge(c) { return {covered:'badge-green',partial:'badge-orange',gap:'badge-red'}[c]||'badge-gray'; }
function coverageLabel(c) { return {covered:'✅ Covered',partial:'⚠️ Partial',gap:'❌ Gap'}[c]||c; }
function escapeHtml(t) { const d=document.createElement('div'); d.textContent=t; return d.innerHTML; }

function downloadFile(name, content, type) {
  const blob = new Blob([content], {type});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

// ==================== RENDER ====================

function renderTracker() {
  document.getElementById('solutions-body').innerHTML = solutionsDiagnostics.map((d, i) => `
    <tr data-area="${d.area}" data-id="${d.id}">
      <td>${i+1}</td>
      <td><strong>${d.name}</strong><br><span style="font-size:11px;color:var(--text-muted)">${d.page}</span></td>
      <td><span class="badge badge-${areaColor(d.area)}">${areaLabel(d.area)}</span></td>
      <td style="font-size:12px">${d.checks}</td>
      <td style="font-size:11px;font-family:monospace">${d.cmdlet}</td>
      <td><select class="test-status" onchange="updateStatus(this,'${d.id}')"><option value="not-tested">⬜ Not Tested</option><option value="pass">✅ Pass</option><option value="partial">⚠️ Partial</option><option value="fail">❌ Fail</option></select></td>
      <td><textarea style="width:100%;min-height:40px;font-size:12px" placeholder="Notes..." oninput="saveNote('${d.id}',this.value)"></textarea></td>
    </tr>`).join('');

  document.getElementById('help-body').innerHTML = helpDiagnostics.map((d, i) => `
    <tr data-area="${d.area}" data-id="${d.id}">
      <td>${i+1}</td>
      <td><strong>${d.name}</strong><br><a href="${d.link}" target="_blank" style="font-size:11px;color:var(--primary)">Run →</a></td>
      <td><span class="badge badge-${areaColor(d.area)}">${areaLabel(d.area)}</span></td>
      <td style="font-size:12px">${d.checks}</td>
      <td style="font-size:12px">${d.role}</td>
      <td><select class="test-status" onchange="updateStatus(this,'${d.id}')"><option value="not-tested">⬜ Not Tested</option><option value="pass">✅ Pass</option><option value="partial">⚠️ Partial</option><option value="fail">❌ Fail</option></select></td>
      <td><textarea style="width:100%;min-height:40px;font-size:12px" placeholder="Notes..." oninput="saveNote('${d.id}',this.value)"></textarea></td>
    </tr>`).join('');
}

function renderGapDashboard() {
  ['labels','encryption','dlp'].forEach(area => {
    document.getElementById('gap-' + area).innerHTML = gapData.filter(g => g.area === area).map(g => `
      <div class="card gap-card ${g.coverage}" data-area="${g.area}" data-coverage="${g.coverage}" data-severity="${g.severity}">
        <h3 style="font-size:13px">${severityIcon(g.severity)} ${g.issue}</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">
          <span class="badge ${coverageBadge(g.coverage)}">${coverageLabel(g.coverage)}</span>
          <span class="badge badge-gray">${g.source}</span>
        </div>
        <p style="font-size:12px"><strong>Diagnostic:</strong> ${g.diagnostic}</p>
        <p style="font-size:11px;color:var(--text-muted);margin-top:4px">💡 ${g.note}</p>
      </div>`).join('');
  });
}

function renderScenarios() {
  document.getElementById('scenarios-container').innerHTML = scenarios.map(s => `
    <div class="card scenario severity-${s.priority}" data-area="${s.area}" data-priority="${s.priority}">
      <h3>${severityIcon(s.priority)} ${s.title}</h3>
      <div style="display:flex;gap:6px;margin:8px 0;flex-wrap:wrap">
        <span class="badge badge-${areaColor(s.area)}">${areaLabel(s.area)}</span>
        <span class="badge ${s.priority==='critical'?'badge-red':'badge-orange'}">${s.priority.toUpperCase()}</span>
      </div>
      <div class="grid-2" style="margin:12px 0">
        <div>
          <strong style="color:var(--danger);font-size:12px">🔨 BREAK</strong>
          <ol class="steps">${s.breakSteps.map(st => `<li>${st}</li>`).join('')}</ol>
          ${s.cleanup ? `<p style="font-size:11px;color:var(--success);margin-top:4px">🧹 ${s.cleanup}</p>` : ''}
        </div>
        <div>
          <strong style="color:var(--primary);font-size:12px">🔍 TEST</strong>
          <ol class="steps">${s.diagnosticSteps.map(st => `<li>${st}</li>`).join('')}</ol>
        </div>
      </div>
      <div style="background:var(--primary-light);border-radius:var(--radius-sm);padding:10px;margin:8px 0;font-size:12px">
        <strong>Expected:</strong> ${s.expectedResult}
      </div>
      <div style="margin-top:8px">
        <strong style="font-size:12px">Grade:</strong>
        <select class="test-status" style="margin-left:8px" onchange="updateStatus(this,'${s.id}-overall')">
          <option value="not-tested">⬜ Not Tested</option><option value="pass">✅ Pass</option><option value="partial">⚠️ Partial</option><option value="fail">❌ Fail</option>
        </select>
        <textarea style="width:100%;margin-top:6px;min-height:40px;font-size:12px" placeholder="Observations..." oninput="saveNote('${s.id}-overall',this.value)"></textarea>
      </div>
    </div>`).join('');
}

function renderTestPlans() {
  const filter = document.getElementById('testplan-filter')?.value || 'all';
  const filtered = filter === 'all' ? testPlans : testPlans.filter(tp => tp.area === filter);
  document.getElementById('testplans-container').innerHTML = filtered.map(tp => `
    <div class="card" style="margin-bottom:16px;border-left:4px solid ${tp.area==='labels'?'var(--primary)':tp.area==='encryption'?'var(--warning)':'var(--success)'}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <h3 style="font-size:15px;flex:1">${tp.title}</h3>
        <span class="badge badge-${areaColor(tp.area)}">${areaLabel(tp.area)}</span>
      </div>
      <p style="font-size:13px;color:var(--text-secondary);margin:8px 0"><strong>Objective:</strong> ${tp.objective}</p>
      <div style="font-size:12px;background:var(--surface-hover);padding:8px 12px;border-radius:var(--radius-sm);margin:8px 0">
        <strong>Entry Point:</strong> ${tp.entryPoint}<br>
        <strong>Cmdlet:</strong> <code style="background:var(--primary-light);padding:2px 6px;border-radius:3px">${tp.cmdlet}</code>
      </div>
      <div class="grid-2" style="margin:12px 0;gap:16px">
        <div>
          <strong style="font-size:12px;color:var(--warning)">📋 Prerequisites</strong>
          <ul style="font-size:12px;padding-left:16px;margin-top:4px">${tp.prereqs.map(p=>'<li>'+p+'</li>').join('')}</ul>
        </div>
        <div>
          <strong style="font-size:12px;color:var(--primary)">🔬 Test Steps</strong>
          <ol style="font-size:12px;padding-left:16px;margin-top:4px">${tp.steps.map(s=>'<li style="margin-bottom:3px">'+s+'</li>').join('')}</ol>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0">
        <div style="background:#0d3320;padding:10px;border-radius:var(--radius-sm);font-size:12px">
          <strong style="color:#4caf50">✅ Good Result:</strong><br>${tp.expectedGood}
        </div>
        <div style="background:#3a1a1a;padding:10px;border-radius:var(--radius-sm);font-size:12px">
          <strong style="color:#f44336">❌ Bad Result:</strong><br>${tp.expectedBad}
        </div>
      </div>
      <div style="margin-top:10px">
        <strong style="font-size:12px">📝 Grading Checklist:</strong>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
          ${tp.gradeChecklist.map(g=>'<span style="font-size:11px;background:var(--surface-hover);padding:3px 8px;border-radius:12px;border:1px solid var(--border)">☐ '+g+'</span>').join('')}
        </div>
      </div>
      ${tp.cleanup ? '<p style="font-size:11px;color:var(--success);margin-top:8px">🧹 <strong>Cleanup:</strong> '+tp.cleanup+'</p>' : ''}
      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
        <strong style="font-size:12px">Test Result:</strong>
        <select class="test-status" style="margin-left:8px" onchange="updateStatus(this,'${tp.id}')">
          <option value="not-tested">⬜ Not Tested</option><option value="pass">✅ Pass</option><option value="partial">⚠️ Partial</option><option value="fail">❌ Fail</option>
        </select>
        <textarea style="width:100%;margin-top:6px;min-height:50px;font-size:12px;border-radius:var(--radius-sm);border:1px solid var(--border);padding:8px" placeholder="Notes: What did the diagnostic actually show? Any issues?" oninput="saveNote('${tp.id}',this.value)"></textarea>
      </div>
    </div>`).join('');
}

function filterTestPlans() { renderTestPlans(); }

function renderPreloadedFindings() {
  document.getElementById('preloaded-findings').innerHTML = `
    <div class="card feedback-entry cat-accuracy">
      <h3><span class="badge badge-red">Accuracy</span> Agent returns "Change a name and email" for DLP question</h3>
      <p style="font-size:12px;color:var(--text-muted)">📅 2026-05-13 | Help Pane — M365 Admin Center | DLP</p>
      <div class="transcript-viewer" style="margin:10px 0;max-height:180px">
        <div><strong class="msg-agent">🤖 AGENT:</strong> <span class="msg-agent">How can I help you today?</span></div>
        <div><strong class="msg-user">👤 USER:</strong> <span class="msg-user">user unable to edit the DLP policy</span></div>
        <div><strong class="msg-agent">🤖 AGENT:</strong> <span class="msg-agent">Can you confirm if issue is with Microsoft Purview Compliance?</span></div>
        <div><strong class="msg-user">👤 USER:</strong> <span class="msg-user">yes</span></div>
        <div style="background:#3a1a1a;padding:6px;border-radius:4px;margin-top:4px;border-left:3px solid #f44">
          <strong class="msg-agent">🤖 AGENT:</strong> <span style="color:#f48">❌ "Change a name and email address — Go to Users > Active Users..."</span>
        </div>
      </div>
      <div style="font-size:13px"><strong style="color:var(--danger)">5 critical failures:</strong> Wrong answer, no diagnostic triggered, useless confirmation, gave up immediately, right links buried in "More Help"</div>
    </div>
    <div class="card feedback-entry cat-relevance">
      <h3><span class="badge badge-orange">Relevance</span> Generic open-ended question instead of structured options</h3>
      <p style="font-size:12px;color:var(--text-muted)">📅 2026-05-13 | All Areas</p>
      <p style="font-size:13px;margin-top:8px">Agent opens with "How can I help?" — forces customers to guess keywords. Should use clickable categories → targeted questions → auto-run diagnostic.</p>
    </div>
    <div class="card feedback-entry cat-ux">
      <h3><span class="badge badge-blue">UX</span> No error recovery — agent gives up after wrong answer</h3>
      <p style="font-size:12px;color:var(--text-muted)">📅 2026-05-13 | All Areas</p>
      <p style="font-size:13px;margin-top:8px">After wrong answer, agent says "May I assist with anything else?" — no "Was this helpful?" feedback, no retry, no escalation.</p>
    </div>`;
}

function renderImprovements() {
  document.getElementById('improvements-grid').innerHTML = improvements.map(imp => `
    <div class="card">
      <h3 style="font-size:13px">${imp.title}</h3>
      <span class="badge ${imp.priority==='P0'?'badge-red':imp.priority==='P1'?'badge-orange':'badge-blue'}">${imp.priority}</span>
      <p style="font-size:12px;margin-top:8px"><strong>Problem:</strong> ${imp.problem}</p>
      <p style="font-size:12px;margin-top:4px"><strong>Solution:</strong> ${imp.solution}</p>
      <p style="font-size:12px;margin-top:4px;color:var(--success)"><strong>Impact:</strong> ${imp.impact}</p>
    </div>`).join('');
}

// ==================== INTERACTIONS ====================

function updateStatus(el, id) {
  el.className = 'test-status ' + el.value;
  const data = JSON.parse(localStorage.getItem('purview-tracker') || '{}');
  data[id] = { status: el.value, ...(data[id]||{}) };
  localStorage.setItem('purview-tracker', JSON.stringify(data));
  updateStats();
}

function saveNote(id, value) {
  const data = JSON.parse(localStorage.getItem('purview-tracker') || '{}');
  data[id] = { ...(data[id]||{}), note: value };
  localStorage.setItem('purview-tracker', JSON.stringify(data));
}

function updateStats() {
  const data = JSON.parse(localStorage.getItem('purview-tracker') || '{}');
  const allDiags = [...solutionsDiagnostics, ...helpDiagnostics];
  let tested=0, pass=0, fail=0, partial=0;
  allDiags.forEach(d => {
    const s = data[d.id]?.status;
    if (s && s !== 'not-tested') { tested++; if(s==='pass') pass++; if(s==='fail') fail++; if(s==='partial') partial++; }
  });
  document.getElementById('h-tested').textContent = tested;
  document.getElementById('s-pass').textContent = pass;
  document.getElementById('s-fail').textContent = fail;
  document.getElementById('s-partial').textContent = partial;
  const pct = Math.round((tested / allDiags.length) * 100);
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-pct').textContent = pct;
  document.getElementById('progress-count').textContent = tested;
  document.getElementById('sidebar-progress').style.width = pct + '%';
  document.getElementById('sidebar-pct').textContent = pct;
}

function filterTracker() {
  const area = document.getElementById('filter-area').value;
  const status = document.getElementById('filter-status').value;
  const data = JSON.parse(localStorage.getItem('purview-tracker') || '{}');
  document.querySelectorAll('#solutions-body tr, #help-body tr').forEach(row => {
    const ra = row.dataset.area;
    const rs = data[row.dataset.id]?.status || 'not-tested';
    row.style.display = ((area==='all'||ra===area) && (status==='all'||rs===status)) ? '' : 'none';
  });
}

function filterGaps() {
  const area = document.getElementById('gap-filter-area').value;
  const coverage = document.getElementById('gap-filter-coverage').value;
  const severity = document.getElementById('gap-filter-severity').value;
  document.querySelectorAll('.gap-card').forEach(card => {
    const sa = area==='all' || card.dataset.area===area;
    const sc = coverage==='all' || card.dataset.coverage===coverage;
    const ss = severity==='all' || card.dataset.severity===severity;
    card.style.display = (sa && sc && ss) ? '' : 'none';
  });
}

function filterScenarios() {
  const area = document.getElementById('scenario-filter-area').value;
  const priority = document.getElementById('scenario-filter-priority').value;
  document.querySelectorAll('.scenario').forEach(card => {
    const sa = area==='all' || card.dataset.area===area;
    const sp = priority==='all' || card.dataset.priority===priority;
    card.style.display = (sa && sp) ? '' : 'none';
  });
}

function loadSaved() {
  const data = JSON.parse(localStorage.getItem('purview-tracker') || '{}');
  Object.entries(data).forEach(([id, val]) => {
    if (val.status) {
      const sel = document.querySelector(`[data-id="${id}"] select.test-status`);
      if (sel) { sel.value = val.status; sel.className = 'test-status ' + val.status; }
    }
    if (val.note) {
      const ta = document.querySelector(`[data-id="${id}"] textarea`);
      if (ta) ta.value = val.note;
    }
  });
  updateStats();
}

function saveProgress() { alert('✅ Progress saved to browser storage!'); }
function resetAll() { if(confirm('Reset ALL results?')){localStorage.removeItem('purview-tracker');location.reload();} }

// ==================== FEEDBACK ====================

let feedbackItems = JSON.parse(localStorage.getItem('purview-feedback') || '[]');

function addFeedback() {
  const item = {
    id:'fb-'+Date.now(), date:new Date().toISOString().split('T')[0],
    category:document.getElementById('fb-category').value,
    diagnostic:document.getElementById('fb-diagnostic').value,
    impact:parseInt(document.getElementById('fb-impact').value),
    question:document.getElementById('fb-question').value,
    actual:document.getElementById('fb-actual').value,
    expected:document.getElementById('fb-expected').value
  };
  if(!item.actual && !item.question){alert('Please fill in at least one field.');return;}
  feedbackItems.push(item);
  localStorage.setItem('purview-feedback', JSON.stringify(feedbackItems));
  renderFeedbackList();
  ['fb-question','fb-actual','fb-expected'].forEach(id=>document.getElementById(id).value='');
  alert('✅ Feedback captured!');
}

function renderFeedbackList() {
  const el = document.getElementById('feedback-list');
  if(!feedbackItems.length){el.innerHTML='<p style="color:var(--text-muted);font-size:13px">No additional feedback yet.</p>';return;}
  el.innerHTML = feedbackItems.map(f=>`
    <div class="card feedback-entry cat-${f.category}">
      <div style="display:flex;justify-content:space-between"><div>
        <h3><span class="badge badge-${areaColor(f.category)}">${f.category}</span> ${f.diagnostic}</h3>
        <p style="font-size:11px;color:var(--text-muted)">📅 ${f.date} | Impact: ${f.impact}/5</p>
      </div><button class="btn btn-sm btn-outline" onclick="deleteFeedback('${f.id}')">🗑️</button></div>
      ${f.question?`<p style="font-size:12px;margin-top:6px"><strong>Q:</strong> "${f.question}"</p>`:''}
      ${f.actual?`<p style="font-size:12px;margin-top:4px"><strong>Actual:</strong> ${f.actual}</p>`:''}
      ${f.expected?`<p style="font-size:12px;margin-top:4px"><strong>Expected:</strong> ${f.expected}</p>`:''}
    </div>`).join('');
}

function deleteFeedback(id) {
  feedbackItems = feedbackItems.filter(f=>f.id!==id);
  localStorage.setItem('purview-feedback', JSON.stringify(feedbackItems));
  renderFeedbackList();
}

// ==================== ADO LOG ====================

let adoFeedbackLog = JSON.parse(localStorage.getItem('purview-ado-log') || '[]');
let selectedADOEntryId = null;

if (adoFeedbackLog.length === 0) {
  adoFeedbackLog.push({
    id:'ado-fb-1', date:'2026-05-13', severity:'1-critical', area:'dlp', category:'accuracy',
    entryPoint:'Help Pane — M365 Admin Center', diagnostic:'General / Help Pane',
    title:'Support Assistant returns completely wrong answer for DLP policy question',
    questionAsked:'user unable to edit the DLP policy',
    agentResponse:'1. Agent asked generic question\n2. I typed "user unable to edit the DLP policy"\n3. Agent asked subjective confirmation\n4. I said "yes"\n5. Agent: "Change a name and email address"',
    problems:'• COMPLETELY WRONG answer\n• No diagnostic triggered\n• Agent gave up immediately\n• Right links buried in "More Help"\n• Useless confirmation question',
    expectedBehavior:'• Detect DLP + policy keywords\n• Ask targeted questions with options\n• Auto-run DLP diagnostic',
    suggestion:'Improve intent matching for Purview keywords. Auto-trigger diagnostics when keywords match.',
    adoStatus:'pending', adoWorkItemId:null
  });
  localStorage.setItem('purview-ado-log', JSON.stringify(adoFeedbackLog));
}

function renderADOLog() {
  const tbody = document.getElementById('ado-log-body');
  tbody.innerHTML = adoFeedbackLog.map((f,i) => {
    const sevBadge = {'1-critical':'badge-red','2-high':'badge-orange','3-medium':'badge-gray'}[f.severity]||'badge-gray';
    const statusBadge = f.adoStatus==='submitted'?'badge-green':'badge-orange';
    return `<tr><td><input type="checkbox" class="ado-select" value="${f.id}"></td>
      <td>${i+1}</td><td><span class="badge ${sevBadge}">${f.severity}</span></td>
      <td><span class="badge badge-${areaColor(f.area)}">${areaLabel(f.area)}</span></td>
      <td><strong style="cursor:pointer;font-size:12px" onclick="showADODetail('${f.id}')">${f.title}</strong><br><span style="font-size:10px;color:var(--text-muted)">📅 ${f.date}</span></td>
      <td><span class="badge badge-${areaColor(f.category)}">${f.category}</span></td>
      <td><span class="badge ${statusBadge}">${f.adoStatus}</span></td>
      <td><button class="btn btn-sm btn-outline" onclick="showADODetail('${f.id}')">👁️</button> <button class="btn btn-sm btn-outline" onclick="submitSingleADO('${f.id}')">🚀</button></td></tr>`;
  }).join('');
}

function showADODetail(id) {
  const entry = adoFeedbackLog.find(f=>f.id===id);
  if(!entry) return;
  selectedADOEntryId = id;
  document.getElementById('ado-detail-panel').style.display = 'block';
  document.getElementById('ado-detail-title').textContent = entry.title;
  document.getElementById('ado-detail-content').innerHTML = `
    <div class="grid-3" style="margin-bottom:12px"><div><strong style="font-size:11px;color:var(--text-muted)">SEVERITY</strong><br>${entry.severity}</div><div><strong style="font-size:11px;color:var(--text-muted)">AREA</strong><br>${areaLabel(entry.area)}</div><div><strong style="font-size:11px;color:var(--text-muted)">CATEGORY</strong><br>${entry.category}</div></div>
    <div style="margin:8px 0"><strong style="font-size:12px;color:var(--primary)">❓ Question:</strong><p style="font-size:12px;background:var(--bg);padding:6px 10px;border-radius:4px;margin-top:2px">"${entry.questionAsked}"</p></div>
    <div style="margin:8px 0"><strong style="font-size:12px;color:var(--danger)">🤖 Response:</strong><pre style="font-size:11px;background:var(--bg);padding:8px;border-radius:4px;white-space:pre-wrap;margin-top:2px">${entry.agentResponse}</pre></div>
    <div style="margin:8px 0"><strong style="font-size:12px;color:var(--warning)">⚠️ Problems:</strong><pre style="font-size:11px;background:var(--bg);padding:8px;border-radius:4px;white-space:pre-wrap;margin-top:2px">${entry.problems}</pre></div>
    <div style="margin:8px 0"><strong style="font-size:12px;color:var(--success)">✅ Expected:</strong><pre style="font-size:11px;background:var(--bg);padding:8px;border-radius:4px;white-space:pre-wrap;margin-top:2px">${entry.expectedBehavior}</pre></div>`;
  document.getElementById('ado-detail-preview').textContent = generateADOWorkItem(entry);
}

function generateADOWorkItem(entry) {
  const org = document.getElementById('ado-org').value || '[ORG]';
  const project = document.getElementById('ado-project').value || '[PROJECT]';
  return `Title: [Self-Help Diagnostics] ${entry.title}\nSeverity: ${entry.severity}\nArea: ${areaLabel(entry.area)}\n\n--- REPRO ---\nEntry Point: ${entry.entryPoint}\nQuestion: "${entry.questionAsked}"\n\nAgent Response:\n${entry.agentResponse}\n\n--- PROBLEMS ---\n${entry.problems}\n\n--- EXPECTED ---\n${entry.expectedBehavior}\n\n--- RECOMMENDATION ---\n${entry.suggestion}\n\nReported By: natripat | Date: ${entry.date}`;
}

function closeDetail() { document.getElementById('ado-detail-panel').style.display='none'; selectedADOEntryId=null; }
function submitSingleToADO() { if(selectedADOEntryId) submitSingleADO(selectedADOEntryId); }
function submitSingleADO(id) {
  const entry = adoFeedbackLog.find(f=>f.id===id);
  if(!entry) return;
  navigator.clipboard.writeText(generateADOWorkItem(entry)).then(()=>{
    entry.adoStatus='submitted';
    localStorage.setItem('purview-ado-log',JSON.stringify(adoFeedbackLog));
    renderADOLog();
    alert('📋 Work item content copied to clipboard! Paste into ADO.');
  });
}
function submitAllToADO() { adoFeedbackLog.filter(f=>f.adoStatus==='pending').forEach(f=>f.adoStatus='submitted'); localStorage.setItem('purview-ado-log',JSON.stringify(adoFeedbackLog)); renderADOLog(); alert('✅ All marked as submitted.'); }
function copyADOContent() { navigator.clipboard.writeText(document.getElementById('ado-detail-preview').textContent).then(()=>alert('📋 Copied!')); }
function toggleSelectAll(cb) { document.querySelectorAll('.ado-select').forEach(c=>c.checked=cb.checked); }
function saveADOConfig() { localStorage.setItem('purview-ado-config',JSON.stringify({org:document.getElementById('ado-org').value,project:document.getElementById('ado-project').value,tags:document.getElementById('ado-tags').value,wit:document.getElementById('ado-wit').value,assignee:document.getElementById('ado-assignee').value,area:document.getElementById('ado-area').value})); alert('✅ Saved!'); }
function loadADOConfig() { const c=JSON.parse(localStorage.getItem('purview-ado-config')||'{}'); if(c.org)document.getElementById('ado-org').value=c.org; if(c.project)document.getElementById('ado-project').value=c.project; if(c.tags)document.getElementById('ado-tags').value=c.tags; if(c.wit)document.getElementById('ado-wit').value=c.wit; if(c.assignee)document.getElementById('ado-assignee').value=c.assignee; if(c.area)document.getElementById('ado-area').value=c.area; }
function importFeedbackJSON() { const input=document.createElement('input'); input.type='file'; input.accept='.json'; input.onchange=e=>{const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>{try{const d=JSON.parse(ev.target.result); const entries=d.entries||d; (Array.isArray(entries)?entries:[entries]).forEach(entry=>{adoFeedbackLog.push({id:'ado-import-'+Date.now()+Math.random(),date:(entry.timestamp||new Date().toISOString()).split('T')[0],severity:'3-medium',area:entry.area||'general',category:entry.category||'ux',entryPoint:entry.entryPoint||'Unknown',diagnostic:entry.diagnostic||'General',title:entry.rawText?.substring(0,80)||'Imported',questionAsked:'',agentResponse:'',problems:entry.rawText||'',expectedBehavior:'',suggestion:'',adoStatus:'pending'});}); localStorage.setItem('purview-ado-log',JSON.stringify(adoFeedbackLog)); renderADOLog(); alert('✅ Imported!');}catch(err){alert('Error: '+err.message);}}; r.readAsText(f);}; input.click(); }
function exportADOCSV() { let csv='Date,Severity,Area,Title,Status\n'; adoFeedbackLog.forEach(f=>{csv+=`"${f.date}","${f.severity}","${areaLabel(f.area)}","${f.title}","${f.adoStatus}"\n`;}); downloadFile('purview-ado-export.csv',csv,'text/csv'); }

// ==================== INTAKE ====================

let intakeEntries = JSON.parse(localStorage.getItem('purview-intake') || '[]');
let intakeFiles = [];

function insertTemplate(name) {
  const templates = {
    'test-result':'TEST: [Diagnostic name]\nENTRY POINT: [Solutions / Help pane]\nQUESTION: [What I asked]\n\nRESPONSE:\n[What agent said]\n\nRESULT: [Pass/Partial/Fail]\n\nISSUES:\n- \n\nEXPECTED:\n',
    'bug':'BUG: [Short description]\nSEVERITY: [Critical/High/Medium]\nSTEPS:\n1. \n2. \n3. \n\nACTUAL: \nEXPECTED: '
  };
  document.getElementById('raw-input').value = templates[name]||'';
}
function clearInput() { document.getElementById('raw-input').value=''; intakeFiles=[]; document.getElementById('intake-attachments').innerHTML=''; }

function handleIntakeFiles(files) {
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      intakeFiles.push({name:file.name, type:file.type, size:file.size, data:e.target.result});
      document.getElementById('intake-attachments').innerHTML = intakeFiles.map((f,i)=>`<span class="badge badge-blue" style="padding:4px 8px">📎 ${f.name} <span style="cursor:pointer;margin-left:4px" onclick="intakeFiles.splice(${i},1);handleIntakeFiles([])">✕</span></span>`).join('');
    };
    file.type.startsWith('image/') ? reader.readAsDataURL(file) : reader.readAsText(file);
  });
}

function submitIntake() {
  const raw = document.getElementById('raw-input').value.trim();
  if(!raw && !intakeFiles.length){alert('Enter feedback or attach a file.');return;}
  const entry = {
    id:'entry-'+Date.now(), timestamp:new Date().toISOString(),
    area:document.getElementById('meta-area').value,
    entryPoint:document.getElementById('meta-entry').value,
    rawText:raw, files:intakeFiles.map(f=>({name:f.name,type:f.type,size:f.size})), status:'new'
  };
  intakeEntries.push(entry);
  localStorage.setItem('purview-intake', JSON.stringify(intakeEntries));
  document.getElementById('raw-input').value='';
  intakeFiles=[]; document.getElementById('intake-attachments').innerHTML='';
  renderIntakeFeed();

  // Submit to shared backend API
  submitToBackend(entry).then(result => {
    if (result && result.success) {
      showToast('✅ Feedback submitted to team dashboard!');
    }
  }).catch(() => {
    showToast('⚠️ Saved locally. Backend sync will retry later.', 'warning');
  });
}

function renderIntakeFeed() {
  const el = document.getElementById('intake-feed');
  if(!intakeEntries.length && !teamFeedbackEntries.length){el.innerHTML='<p style="color:var(--text-muted)">No captures yet.</p>';return;}
  
  // Combine local and team entries, show team entries with submitter info
  const localHtml = intakeEntries.slice().reverse().slice(0,10).map(e=>`
    <div class="card" style="padding:12px">
      <div style="display:flex;justify-content:space-between"><span class="badge badge-${areaColor(e.area)}">${areaLabel(e.area)}</span><span style="font-size:10px;color:var(--text-muted)">${new Date(e.timestamp).toLocaleString()}</span></div>
      <p style="font-size:12px;margin-top:6px;color:var(--text-secondary)">${escapeHtml((e.rawText||'').substring(0,150))}${(e.rawText||'').length>150?'...':''}</p>
    </div>`).join('');

  const teamHtml = teamFeedbackEntries.slice(0,20).map(e=>`
    <div class="card" style="padding:12px;border-left:3px solid var(--accent)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="badge badge-${areaColor(e.area)}">${areaLabel(e.area)}</span>
        <span style="font-size:10px;color:var(--text-muted)">👤 ${escapeHtml(e.submittedBy||'teammate')} · ${e.createdAt ? new Date(e.createdAt).toLocaleString() : ''}</span>
      </div>
      <p style="font-size:12px;margin-top:6px;color:var(--text-secondary)">${escapeHtml((e.description||'').substring(0,150))}${(e.description||'').length>150?'...':''}</p>
      ${e.severity ? '<span style="font-size:10px;background:var(--primary-light);padding:2px 6px;border-radius:4px">' + escapeHtml(e.severity) + '</span>' : ''}
    </div>`).join('');

  el.innerHTML = (teamHtml ? '<div class="section-title" style="font-size:13px;margin-bottom:8px">🌐 Team Submissions</div>' + teamHtml : '') +
    (localHtml ? '<div class="section-title" style="font-size:13px;margin:12px 0 8px">📝 My Captures</div>' + localHtml : '');
}

// ==================== BACKEND API ====================

let teamFeedbackEntries = [];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function submitToBackend(entry) {
  try {
    const resp = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: entry.entryPoint || 'general',
        description: entry.rawText || '',
        area: entry.area || 'general',
        severity: 'medium',
        diagnosticName: '',
        notes: entry.files && entry.files.length ? 'Attachments: ' + entry.files.map(f=>f.name).join(', ') : ''
      })
    });
    if (!resp.ok) {
      console.warn('Backend submit failed:', resp.status);
      return null;
    }
    return await resp.json();
  } catch(e) {
    console.warn('Backend unavailable:', e.message);
    return null;
  }
}

async function loadTeamFeedback() {
  try {
    const resp = await fetch('/api/feedback');
    if (!resp.ok) return;
    teamFeedbackEntries = await resp.json();
    renderIntakeFeed();
  } catch(e) {
    console.warn('Could not load team feedback:', e.message);
  }
}

function showToast(message, type) {
  const existing = document.getElementById('feedback-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'feedback-toast';
  toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:' + (type==='warning'?'#ff8c00':'#107c10') + ';color:#fff;padding:12px 20px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.2);animation:fadeIn .3s';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Load team feedback on startup
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(loadTeamFeedback, 1000));
}

// ==================== EXPORTS ====================

function exportCSV() {
  const data = JSON.parse(localStorage.getItem('purview-tracker')||'{}');
  let csv='Type,Area,Diagnostic,Status,Notes\n';
  [...solutionsDiagnostics.map(d=>({...d,type:'Solutions'})),...helpDiagnostics.map(d=>({...d,type:'Help Pane'}))].forEach(d=>{
    csv+=`"${d.type}","${areaLabel(d.area)}","${d.name}","${data[d.id]?.status||'not-tested'}","${(data[d.id]?.note||'').replace(/"/g,'""')}"\n`;
  });
  downloadFile('purview-test-tracker.csv',csv,'text/csv');
}

function exportGapReport() {
  let md='# Gap Analysis Report\n\nTotal: 24 | Covered: 8 | Partial: 7 | Gaps: 9\n\n';
  gapData.forEach(g=>{md+=`- ${severityIcon(g.severity)} **${g.issue}** [${coverageLabel(g.coverage)}] — ${g.diagnostic}\n`;});
  downloadFile('purview-gap-report.md',md,'text/markdown');
}

function exportFeedbackReport() {
  const feedbackData = JSON.parse(localStorage.getItem('purview-feedback') || '[]');
  const intakeData = JSON.parse(localStorage.getItem('purview-intake') || '[]');
  const allFeedback = [...feedbackData, ...intakeData];

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PG Feedback Report — Purview Self-Help Diagnostics</title>
<style>
body{font-family:'Segoe UI',sans-serif;max-width:1000px;margin:0 auto;padding:40px;background:#1a1a2e;color:#e0e0e0}
h1{color:#0078d4;border-bottom:2px solid #0078d4;padding-bottom:12px}
h2{color:#6264a7;margin-top:32px}
h3{margin-top:20px;color:#fff}
.meta{color:#a0a0a0;font-size:13px;margin-bottom:20px}
.finding{background:#16213e;border:1px solid #2a3a5e;border-radius:8px;padding:20px;margin:16px 0;border-left:4px solid #d13438}
.finding.p1{border-left-color:#ff8c00}
.finding.p2{border-left-color:#0078d4}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}
.badge-red{background:#3a1a1a;color:#f44}
.badge-orange{background:#3a2a0a;color:#ff8c00}
.badge-blue{background:#1a2a4a;color:#4aa3f9}
table{width:100%;border-collapse:collapse;margin:12px 0}
th,td{border:1px solid #2a3a5e;padding:8px 12px;text-align:left;font-size:13px}
th{background:#0d1a3a;color:#a0c0ff}
.transcript{background:#0a0a1a;border:1px solid #333;border-radius:6px;padding:12px;margin:10px 0;font-size:12px}
.transcript .agent{color:#f48}
.transcript .user{color:#4caf50}
.evidence{background:#0a1a2a;border:1px solid #2a4a6e;border-radius:6px;padding:12px;margin:10px 0}
.evidence img{max-width:100%;border-radius:4px;margin:8px 0}
.evidence video{max-width:100%;border-radius:4px;margin:8px 0}
.recommendation{background:#0d3320;border:1px solid #1a5a3a;border-radius:6px;padding:12px;margin:8px 0}
.section-summary{background:#1a2a4a;padding:16px;border-radius:8px;margin:16px 0}
code{background:#0a0a2a;padding:2px 6px;border-radius:3px;font-size:12px}
</style></head><body>
<h1>🔬 PG Feedback Report — Purview Self-Help Diagnostics</h1>
<div class="meta">
  <strong>Reviewers:</strong> Nandan Tripathi (natripat), Kapil Chopra (kchopra)<br>
  <strong>Date:</strong> ${new Date().toLocaleDateString('en-US', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}<br>
  <strong>Scope:</strong> Self-Help Diagnostics (Solutions Pages + Help Pane)<br>
  <strong>Reference:</strong> <a href="https://learn.microsoft.com/en-ca/troubleshoot/microsoft-365/purview/diagnostics/purview-compliance-diagnostics" style="color:#4aa3f9">Microsoft Learn Documentation</a>
</div>

<div class="section-summary">
  <h3>📊 Executive Summary</h3>
  <table>
    <tr><th>Category</th><th>Findings</th><th>Priority</th></tr>
    <tr><td>Critical Accuracy Issues</td><td>Agent returns irrelevant responses for known keywords</td><td><span class="badge badge-red">P0</span></td></tr>
    <tr><td>UX Flow Gaps</td><td>Open-ended questions instead of structured decision trees</td><td><span class="badge badge-red">P0</span></td></tr>
    <tr><td>Missing Error Recovery</td><td>No retry/escalation after wrong answer</td><td><span class="badge badge-orange">P1</span></td></tr>
    <tr><td>Documentation Clarity</td><td>Input format guidance needs improvement</td><td><span class="badge badge-orange">P1</span></td></tr>
  </table>
</div>

<h2>🔴 Critical Findings</h2>
`;

  // Add pre-loaded findings
  html += `
<div class="finding">
  <h3><span class="badge badge-red">P0 — Accuracy</span> Agent Returns Wrong Answer for DLP Question</h3>
  <p><strong>Tested:</strong> Help Pane in M365 Admin Center</p>
  <p><strong>Query:</strong> "user unable to edit the DLP policy"</p>
  <div class="transcript">
    <div class="agent">🤖 AGENT: "How can I help you today to get you the right help and support?"</div>
    <div class="user">👤 USER: "user unable to edit the DLP policy"</div>
    <div class="agent">🤖 AGENT: "Can you please confirm if the issue is with Microsoft Purview Compliance"</div>
    <div class="user">👤 USER: "yes"</div>
    <div class="agent" style="background:#2a0a0a;padding:6px;border-radius:4px;margin-top:6px">🤖 AGENT: ❌ "Change a name and email address — Go to Users > Active Users..."</div>
  </div>
  <p><strong>Problems Identified:</strong></p>
  <ul>
    <li>Response is COMPLETELY WRONG — asked about DLP, got user name change instructions</li>
    <li>No diagnostic triggered despite "DLP" + "policy" being exact keywords</li>
    <li>Subjective confirmation question added no value</li>
    <li>Agent gave up after wrong answer — no retry offered</li>
    <li>Right links (DLP policy tips, Self-Help Diagnostics) buried in "More Help" section</li>
  </ul>
  <div class="recommendation">
    <strong>💡 Recommendation:</strong> Detect "DLP" + "policy" + "unable to edit" keywords → Ask structured question with options: [Permission error] [Policy won't save] [Policy not found] [Other] → Auto-run appropriate DLP diagnostic
  </div>
</div>
`;

  // Add dynamically captured feedback
  if (allFeedback.length > 0) {
    html += `<h2>📝 Captured Test Feedback (${allFeedback.length} items)</h2>`;
    allFeedback.forEach((fb, i) => {
      html += `<div class="finding ${fb.priority === 'P0' || fb.priority === 'critical' ? '' : fb.priority === 'P1' || fb.priority === 'high' ? 'p1' : 'p2'}">
        <h3>${fb.title || fb.category || 'Finding #' + (i+1)}</h3>
        <p><strong>Date:</strong> ${fb.date || fb.timestamp || 'N/A'} | <strong>Area:</strong> ${fb.area || 'General'}</p>
        ${fb.description ? '<p>' + fb.description + '</p>' : ''}
        ${fb.transcript ? '<div class="transcript">' + fb.transcript + '</div>' : ''}
        ${fb.evidence || fb.attachments ? '<div class="evidence"><strong>📎 Evidence:</strong><br>' + (fb.evidence || fb.attachments || '') + '</div>' : ''}
        ${fb.recommendation ? '<div class="recommendation"><strong>💡 Recommendation:</strong> ' + fb.recommendation + '</div>' : ''}
      </div>`;
    });
  }

  // Add improvements section
  html += `<h2>💡 Prioritized Recommendations</h2>`;
  improvements.forEach(imp => {
    html += `<div class="finding ${imp.priority==='P0'?'':'p1'}">
      <h3><span class="badge ${imp.priority==='P0'?'badge-red':'badge-orange'}">${imp.priority}</span> ${imp.title}</h3>
      <p><strong>Problem:</strong> ${imp.problem}</p>
      <div class="recommendation"><strong>Solution:</strong> ${imp.solution}</div>
      <p><strong>Expected Impact:</strong> ${imp.impact}</p>
    </div>`;
  });

  html += `
<h2>📎 Evidence & Attachments</h2>
<p style="color:#a0a0a0">Screenshots, transcripts, and recordings captured during testing are referenced inline with each finding above. Original evidence files are available in the project repository.</p>

<div class="section-summary">
  <h3>✅ Next Steps</h3>
  <ol>
    <li>Review findings and confirm alignment with your expectations</li>
    <li>We continue testing remaining scenarios and add findings</li>
    <li>Final consolidated report with sign-off checklist</li>
  </ol>
</div>

<footer style="margin-top:40px;padding-top:20px;border-top:1px solid #2a3a5e;color:#707070;font-size:12px">
  Generated from Purview Diagnostics Review Portal | Reviewers: natripat, kchopra | ${new Date().toLocaleString()}
</footer>
</body></html>`;

  downloadFile('purview-pg-feedback-report.html', html, 'text/html');
}

function exportFullReport() {
  let md='# Complete Review Package\n\nGenerated: '+new Date().toLocaleString()+'\n\n';
  md+='## Gap Analysis\n'; gapData.forEach(g=>{md+=`- ${g.issue} [${g.coverage}]\n`;});
  md+='\n## Test Results\n'; const data=JSON.parse(localStorage.getItem('purview-tracker')||'{}');
  [...solutionsDiagnostics,...helpDiagnostics].forEach(d=>{md+=`- ${d.name}: ${data[d.id]?.status||'not-tested'}\n`;});
  md+='\n## Recommendations\n'; improvements.forEach(imp=>{md+=`- ${imp.priority}: ${imp.title}\n`;});
  downloadFile('purview-complete-review.md',md,'text/markdown');
}

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', async () => {
  // Validate user access
  const allowed = await validateAccess();
  if (!allowed) return;
  // Load theme
  if(localStorage.getItem('purview-theme')==='dark'){document.documentElement.setAttribute('data-theme','dark');document.querySelector('.theme-toggle').textContent='☀️';}
  // Render all
  renderTracker();
  renderGapDashboard();
  renderScenarios();
  renderTestPlans();
  renderPreloadedFindings();
  renderImprovements();
  renderFeedbackList();
  renderADOLog();
  renderIntakeFeed();
  loadSaved();
  loadADOConfig();
  // Char counter
  const raw=document.getElementById('raw-input');
  if(raw) raw.addEventListener('input',()=>{document.getElementById('char-count').textContent=raw.value.length+' chars';});
});
