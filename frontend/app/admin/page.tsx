'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';

export default function AdminPage() {
  const [folders, setFolders] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [currentFolder, setCurrentFolder] = useState<any>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [quizTitle, setQuizTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pasteContent, setPasteContent] = useState('');
  const [pasteFormat, setPasteFormat] = useState<'json' | 'html'>('json');
  const [uploadMode, setUploadMode] = useState<'file' | 'paste'>('file');
  const [message, setMessage] = useState('');
  const [path, setPath] = useState<any[]>([{ _id: null, name: 'Root' }]);
  const router = useRouter();

  useEffect(() => {
    const role = Cookies.get('role');
    if (role !== 'admin') {
      router.push('/dashboard');
    }
    loadFolders(null);
  }, []);

  const loadFolders = async (parentId: string | null, folderName?: string) => {
    try {
      const data = await api.folders.list(parentId || undefined);
      setFolders(data);
      
      if (parentId) {
        const folderDetails = await api.folders.get(parentId);
        setCurrentFolder(folderDetails);
        
        const quizData = await api.quizzes.list(parentId);
        setQuizzes(quizData);
        
        if (folderName) {
            const index = path.findIndex(p => p._id === parentId);
            if (index !== -1) {
                setPath(path.slice(0, index + 1));
            } else {
                setPath([...path, { _id: parentId, name: folderName }]);
            }
        }
      } else {
        setCurrentFolder(null);
        setQuizzes([]);
        setPath([{ _id: null, name: 'Root' }]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const deleteQuiz = async (quizId: string, quizTitle: string) => {
    if (!confirm(`Are you sure you want to delete the quiz "${quizTitle}"? This cannot be undone.`)) {
      return;
    }
    try {
      await api.quizzes.delete(quizId);
      setMessage("✅ Quiz deleted successfully");
      await loadFolders(currentFolder?._id || null);
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage("❌ Error: " + err.message);
    }
  };

  const deleteFolder = async (folderId: string, folderName: string) => {
    if (!confirm(`Are you sure you want to delete "${folderName}"? This will permanently delete ALL subfolders, quizzes, and student attempts within this folder. This action cannot be undone.`)) {
      return;
    }
    try {
      await api.folders.delete(folderId);
      setMessage("✅ Folder deleted successfully");
      await loadFolders(currentFolder?._id || null);
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage("❌ Error: " + err.message);
    }
  };

  const createFolder = async () => {
    if (!newFolderName) return;
    try {
      await api.folders.create({ name: newFolderName, parent_folder_id: currentFolder?._id || null });
      setNewFolderName('');
      await loadFolders(currentFolder?._id || null);
      setMessage("✅ Folder created successfully");
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage("❌ Error: " + err.message);
    }
  };

  const uploadQuiz = async () => {
    if (!quizTitle || !currentFolder?._id) {
        setMessage("⚠️ Title and a folder selection are required.");
        return;
    }

    try {
      if (uploadMode === 'file') {
        if (!file) {
          setMessage("⚠️ Please select a file.");
          return;
        }
        const formData = new FormData();
        formData.append('title', quizTitle);
        formData.append('folder_id', currentFolder._id);
        formData.append('file', file);
        await api.quizzes.upload(formData);
      } else {
        if (!pasteContent) {
          setMessage("⚠️ Please paste the content.");
          return;
        }
        await api.quizzes.createManual({
          title: quizTitle,
          folder_id: currentFolder._id,
          content: pasteContent,
          format: pasteFormat
        });
      }

      setQuizTitle('');
      setFile(null);
      setPasteContent('');
      if (currentFolder?._id) {
        await loadFolders(currentFolder._id);
      }
      setMessage("✅ Quiz published successfully");
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage("❌ Error: " + err.message);
    }
  };

  const jsonSample = `[
  {
    "text": "What is 2+2?",
    "options": ["3", "4", "5"],
    "correct_option_index": 1,
    "explanation": "Simple addition"
  }
]`;

  const htmlSample = `<div class="question">
  <p class="text">What is the capital of France?</p>
  <ul class="options">
    <li>London</li>
    <li>Paris</li>
    <li>Berlin</li>
  </ul>
  <span class="correct">1</span>
  <p class="explanation">Paris is the capital.</p>
</div>`;

  return (
    <div className="container py-8">
      <header style={{ marginBottom: '3rem' }}>
        <h1 className="hero-title" style={{ fontSize: '3rem' }}>Admin Dashboard</h1>
        <p style={{ color: 'var(--muted)', fontSize: '1.1rem' }}>Manage your library and content structure.</p>
      </header>

      <div className="breadcrumb" style={{ marginBottom: '2rem' }}>
        {path.map((crumb, i) => (
          <span key={crumb._id || 'root'} className="flex items-center">
            <span 
              className={`breadcrumb-item ${i === path.length - 1 ? 'active' : ''}`} 
              onClick={() => loadFolders(crumb._id)}
            >
              {crumb.name}
            </span>
            {i < path.length - 1 && <span style={{ margin: '0 0.5rem', opacity: 0.3 }}>/</span>}
          </span>
        ))}
      </div>

      {message && (
        <div className="card mb-6" style={{ 
          padding: '1rem 1.5rem',
          background: message.includes('❌') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
          borderColor: message.includes('❌') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
          color: message.includes('❌') ? '#f87171' : '#34d399',
          fontWeight: 600
        }}>
          {message}
        </div>
      )}
      
      <div className="flex-responsive">
        <div style={{ flex: 1 }}>
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div style={{ padding: '0.5rem', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)' }}>
                 📁
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Folders & Quizzes</h3>
            </div>
            
            <div className="flex flex-col gap-3 mb-8">
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.05em' }}>NEW SUBFOLDER</label>
              <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Enter folder name..." 
                    value={newFolderName} 
                    onChange={(e) => setNewFolderName(e.target.value)} 
                    style={{ flex: 1 }}
                  />
                  <button className="btn-primary" onClick={createFolder} style={{ whiteSpace: 'nowrap' }}>Create</button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.05em' }}>
                  SUBFOLDERS IN: {currentFolder ? currentFolder.name.toUpperCase() : 'ROOT'}
              </label>
              {folders.length === 0 && <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: '12px', fontSize: '0.9rem' }}>No subfolders found here.</p>}
              {folders.map(f => (
                <div key={f._id} className="flex justify-between items-center p-4" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-3">
                      <span style={{ fontSize: '1.25rem' }}>📁</span>
                      <span style={{ fontWeight: 600 }}>{f.name}</span>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }} onClick={() => loadFolders(f._id, f.name)}>Open</button>
                    <button className="btn-secondary" style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.2)' }} onClick={() => deleteFolder(f._id, f.name)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>

            {currentFolder && (
              <div className="flex flex-col gap-3 mt-6" style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.05em' }}>
                    QUIZZES IN: {currentFolder.name.toUpperCase()}
                </label>
                {quizzes.length === 0 && <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: '12px', fontSize: '0.9rem' }}>No quizzes/JSONs uploaded in this folder yet.</p>}
                {quizzes.map(q => (
                  <div key={q._id} className="flex justify-between items-center p-4" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-3">
                        <span style={{ fontSize: '1.25rem' }}>📝</span>
                        <div className="flex flex-col">
                          <span style={{ fontWeight: 600 }}>{q.title}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{q.questions.length} Questions</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-secondary" style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.2)' }} onClick={() => deleteQuiz(q._id, q.title)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1.5 }}>
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div style={{ padding: '0.5rem', borderRadius: '10px', background: 'rgba(236, 72, 153, 0.1)', color: 'var(--secondary)' }}>
                 🚀
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Add New Quiz</h3>
            </div>
            
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.05em' }}>QUIZ TITLE</label>
                <input 
                  type="text" 
                  placeholder="e.g., Intro to Physics" 
                  value={quizTitle} 
                  onChange={(e) => setQuizTitle(e.target.value)} 
                />
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex gap-4">
                  <button 
                    className={uploadMode === 'file' ? 'btn-primary' : 'btn-secondary'} 
                    style={{ flex: 1, padding: '0.75rem' }}
                    onClick={() => setUploadMode('file')}
                  >
                    📂 Upload File
                  </button>
                  <button 
                    className={uploadMode === 'paste' ? 'btn-primary' : 'btn-secondary'} 
                    style={{ flex: 1, padding: '0.75rem' }}
                    onClick={() => setUploadMode('paste')}
                  >
                    📝 Paste Content
                  </button>
                </div>

                {uploadMode === 'file' ? (
                  <div className="flex flex-col gap-2">
                    <div style={{ border: '2px dashed var(--border)', borderRadius: '12px', padding: '3rem', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--primary)'} onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}>
                      <input 
                        type="file" 
                        onChange={(e) => setFile(e.target.files?.[0] || null)} 
                        accept=".json,.html"
                        id="file-upload"
                        style={{ display: 'none' }}
                      />
                      <label htmlFor="file-upload" style={{ cursor: 'pointer' }}>
                          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
                          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{file ? file.name : 'Click to select .json or .html'}</div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.5rem' }}>Drag and drop also supported</div>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-4">
                        <button 
                            className={pasteFormat === 'json' ? 'badge-primary' : 'badge-secondary'}
                            style={{ padding: '0.4rem 1rem', borderRadius: '8px', cursor: 'pointer', background: pasteFormat === 'json' ? 'var(--primary)' : 'rgba(255,255,255,0.05)', color: 'white', border: 'none', fontWeight: 700 }}
                            onClick={() => setPasteFormat('json')}
                        >
                            JSON
                        </button>
                        <button 
                            className={pasteFormat === 'html' ? 'badge-primary' : 'badge-secondary'}
                            style={{ padding: '0.4rem 1rem', borderRadius: '8px', cursor: 'pointer', background: pasteFormat === 'html' ? 'var(--primary)' : 'rgba(255,255,255,0.05)', color: 'white', border: 'none', fontWeight: 700 }}
                            onClick={() => setPasteFormat('html')}
                        >
                            HTML
                        </button>
                    </div>
                    <textarea 
                        rows={10} 
                        placeholder={pasteFormat === 'json' ? 'Paste JSON here...' : 'Paste HTML here...'}
                        value={pasteContent}
                        onChange={(e) => setPasteContent(e.target.value)}
                        style={{ width: '100%', padding: '1.25rem', borderRadius: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '0.9rem' }}
                    />
                  </div>
                )}
              </div>

              <button className="btn-primary w-full" style={{ padding: '1.25rem', fontSize: '1.1rem' }} onClick={uploadQuiz} disabled={!currentFolder}>
                 Publish to {currentFolder ? currentFolder.name : 'Selected Folder'}
              </button>
            </div>

            <div className="mt-8 p-6" style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid var(--border)' }}>
              <div className="flex justify-between items-center mb-4">
                <h4 style={{ fontSize: '0.9rem', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                    💡 Quick Copy Samples
                </h4>
              </div>
              <div className="flex gap-3">
                 <button className="btn-secondary w-full" onClick={() => { setPasteContent(jsonSample); setPasteFormat('json'); setUploadMode('paste'); }}>Use JSON Sample</button>
                 <button className="btn-secondary w-full" onClick={() => { setPasteContent(htmlSample); setPasteFormat('html'); setUploadMode('paste'); }}>Use HTML Sample</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
