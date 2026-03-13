/* DOCUMENTS (P5.7) — Document versioning & workflow */

const SL = window._SL;
const { state, authState, $, esc, api, toast, fmtDate,
        authFetch, _canEdit, _showLoading, _hideLoading } = SL;

const STATUS_CONFIG = {
  draft:        { label: 'Draft',        color: '#94A3B8', next: 'under_review' },
  under_review: { label: 'Under Review', color: '#F59E0B', next: 'approved' },
  approved:     { label: 'Approved',     color: '#22C55E', next: 'archived' },
  archived:     { label: 'Archived',     color: '#6B7280', next: null },
};

const DOC_TYPES = ['PDT', 'budget', 'reference', 'map_kmz', 'contract', 'other'];

let _docs = [];
let _expandedDoc = null; // doc id with versions panel open

async function renderDocuments() {
  const container = $('documents-content');
  if (!container) return;
  _showLoading(container, 'cards', { count: 4 });

  try {
    const res = await authFetch(`/api/productions/${state.prodId}/documents`);
    _docs = res.ok ? await res.json() : [];
  } catch (e) {
    _docs = [];
  }

  const canEdit = _canEdit();

  let html = `<div class="documents-header">
    <h2>Documents</h2>
    ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="App._docShowUpload()">+ Upload Document</button>` : ''}
  </div>`;

  if (!_docs.length) {
    html += `<div class="empty-state" style="padding:3rem;text-align:center;color:#94A3B8">
      <p>No documents yet.</p>
      ${canEdit ? '<p>Upload your first document to get started.</p>' : ''}
    </div>`;
  } else {
    html += '<div class="documents-grid">';
    for (const doc of _docs) {
      const st = STATUS_CONFIG[doc.status] || STATUS_CONFIG.draft;
      const nextStatus = st.next;
      const version = doc.current_version || 1;

      html += `<div class="doc-card" data-doc-id="${doc.id}">
        <div class="doc-card-header">
          <span class="doc-badge" style="background:${st.color}">${esc(st.label)}</span>
          <span class="doc-type">${esc(doc.doc_type || 'other')}</span>
          <span class="doc-version">v${version}</span>
        </div>
        <div class="doc-card-body">
          <div class="doc-name">${esc(doc.name)}</div>
          <div class="doc-meta">${doc.format ? esc(doc.format.toUpperCase()) : ''} ${doc.uploaded_at ? '&middot; ' + fmtDate(doc.uploaded_at) : ''}</div>
        </div>
        <div class="doc-card-actions">`;

      if (doc.file_path) {
        html += `<a href="/api/documents/download/${esc(doc.file_path)}" class="btn btn-sm btn-secondary" target="_blank" title="Download">Download</a>`;
      }

      if (canEdit) {
        html += `<button class="btn btn-sm btn-secondary" onclick="App._docToggleVersions(${doc.id})" title="Versions">Versions</button>`;
        if (nextStatus) {
          const nextConf = STATUS_CONFIG[nextStatus];
          html += `<button class="btn btn-sm" style="background:${nextConf.color};color:#fff" onclick="App._docSetStatus(${doc.id},'${nextStatus}')">${nextConf.label}</button>`;
        }
        html += `<button class="btn btn-sm btn-secondary" onclick="App._docUploadVersion(${doc.id})" title="New version">+ Version</button>`;
        html += `<button class="btn btn-sm btn-danger" onclick="App._docDelete(${doc.id})" title="Delete">Del</button>`;
      }

      html += `</div>`;

      // Versions panel (expandable)
      if (_expandedDoc === doc.id) {
        html += `<div class="doc-versions-panel" id="doc-versions-${doc.id}">Loading versions...</div>`;
      }

      html += `</div>`;
    }
    html += '</div>';
  }

  container.innerHTML = html;

  // Load versions if expanded
  if (_expandedDoc) {
    _loadVersions(_expandedDoc);
  }
}

async function _loadVersions(docId) {
  const panel = $(`doc-versions-${docId}`);
  if (!panel) return;
  try {
    const res = await authFetch(`/api/productions/${state.prodId}/documents/${docId}/versions`);
    const versions = res.ok ? await res.json() : [];
    if (!versions.length) {
      panel.innerHTML = '<div style="padding:.5rem;color:#94A3B8">No versions found.</div>';
      return;
    }
    let html = '<table class="doc-versions-table"><thead><tr><th>Version</th><th>Uploaded</th><th>By</th><th>File</th></tr></thead><tbody>';
    for (const v of versions) {
      html += `<tr>
        <td>v${v.version_number}</td>
        <td>${v.uploaded_at ? fmtDate(v.uploaded_at) : '-'}</td>
        <td>${esc(v.upload_nickname || '-')}</td>
        <td>${v.file_path ? `<a href="/api/documents/download/${esc(v.file_path)}" target="_blank">Download</a>` : '-'}</td>
      </tr>`;
    }
    html += '</tbody></table>';
    panel.innerHTML = html;
  } catch (e) {
    panel.innerHTML = '<div style="color:#EF4444">Error loading versions</div>';
  }
}

function _docToggleVersions(docId) {
  _expandedDoc = _expandedDoc === docId ? null : docId;
  renderDocuments();
}

async function _docSetStatus(docId, status) {
  try {
    const res = await authFetch(`/api/productions/${state.prodId}/documents/${docId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      toast(`Status updated to ${STATUS_CONFIG[status]?.label || status}`);
      renderDocuments();
    } else {
      const err = await res.json();
      toast(err.error || 'Error', 'error');
    }
  } catch (e) {
    toast('Network error', 'error');
  }
}

async function _docDelete(docId) {
  if (!confirm('Delete this document and all its versions?')) return;
  try {
    const res = await authFetch(`/api/productions/${state.prodId}/documents/${docId}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Document deleted');
      renderDocuments();
    }
  } catch (e) {
    toast('Error deleting', 'error');
  }
}

function _docShowUpload() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'doc-upload-modal';
  overlay.innerHTML = `<div class="modal-card" style="max-width:500px">
    <div class="modal-header"><h3>Upload Document</h3>
      <button class="modal-close" onclick="document.getElementById('doc-upload-modal').remove()">&times;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Name *</label>
        <input type="text" id="doc-up-name" class="form-control" placeholder="Document name">
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <select id="doc-up-type" class="form-control">
          ${DOC_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">File</label>
        <input type="file" id="doc-up-file" class="form-control">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="document.getElementById('doc-upload-modal').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="App._docSubmitUpload()">Upload</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

async function _docSubmitUpload() {
  const name = document.getElementById('doc-up-name')?.value?.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  const docType = document.getElementById('doc-up-type')?.value || '';
  const fileInput = document.getElementById('doc-up-file');
  const file = fileInput?.files?.[0];

  const fd = new FormData();
  fd.append('name', name);
  fd.append('doc_type', docType);
  if (file) fd.append('file', file);

  try {
    const res = await authFetch(`/api/productions/${state.prodId}/documents`, {
      method: 'POST',
      body: fd,
    });
    if (res.ok) {
      toast('Document uploaded');
      document.getElementById('doc-upload-modal')?.remove();
      renderDocuments();
    } else {
      const err = await res.json();
      toast(err.error || 'Upload failed', 'error');
    }
  } catch (e) {
    toast('Network error', 'error');
  }
}

function _docUploadVersion(docId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'doc-version-modal';
  overlay.innerHTML = `<div class="modal-card" style="max-width:400px">
    <div class="modal-header"><h3>Upload New Version</h3>
      <button class="modal-close" onclick="document.getElementById('doc-version-modal').remove()">&times;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">File *</label>
        <input type="file" id="doc-ver-file" class="form-control">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="document.getElementById('doc-version-modal').remove()">Cancel</button>
      <button class="btn btn-primary" onclick="App._docSubmitVersion(${docId})">Upload</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

async function _docSubmitVersion(docId) {
  const fileInput = document.getElementById('doc-ver-file');
  const file = fileInput?.files?.[0];
  if (!file) { toast('File is required', 'error'); return; }

  const fd = new FormData();
  fd.append('file', file);

  try {
    const res = await authFetch(`/api/productions/${state.prodId}/documents/${docId}/versions`, {
      method: 'POST',
      body: fd,
    });
    if (res.ok) {
      toast('New version uploaded');
      document.getElementById('doc-version-modal')?.remove();
      _expandedDoc = docId;
      renderDocuments();
    } else {
      const err = await res.json();
      toast(err.error || 'Upload failed', 'error');
    }
  } catch (e) {
    toast('Network error', 'error');
  }
}

// Register on App
App.renderDocuments = renderDocuments;
App._docShowUpload = _docShowUpload;
App._docSubmitUpload = _docSubmitUpload;
App._docToggleVersions = _docToggleVersions;
App._docSetStatus = _docSetStatus;
App._docDelete = _docDelete;
App._docUploadVersion = _docUploadVersion;
App._docSubmitVersion = _docSubmitVersion;
