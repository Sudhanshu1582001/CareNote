import { useState, useRef } from "react";

const SAMPLES = [
  {
    label: "Discharge Summary",
    text: `Patient: Male, 54 years. Admitted with acute anterior STEMI. Underwent primary PCI with drug-eluting stent to LAD. Echo shows EF 45%. Started on dual antiplatelet therapy (Aspirin 75mg OD + Clopidogrel 75mg OD), Ramipril 5mg OD, Metoprolol 25mg BD, Atorvastatin 40mg OD. Discharge Day 3. Follow-up with cardiologist in 2 weeks. Restrict physical activity for 4 weeks. Return to ED if chest pain, dyspnoea, or palpitations recur.`
  },
  {
    label: "Lab Report",
    text: `CBC Report. Haemoglobin: 9.2 g/dL (Ref: 12-16). WBC: 11,400/uL (Ref: 4000-11000). Platelets: 420,000/uL (Ref: 150000-400000). MCV: 72 fL (Ref: 80-100). Serum Ferritin: 6 ng/mL (Ref: 12-150). Iron: 42 ug/dL (Ref: 60-170). TIBC: 480 ug/dL (Ref: 250-370).`
  },
  {
    label: "Radiology Report",
    text: `Chest X-Ray PA View. Clinical indication: Breathlessness. Findings: Cardiomegaly with cardiothoracic ratio 0.58. Mild bilateral pleural effusion noted, right > left. Prominent bronchovascular markings bilaterally. No consolidation or pneumothorax. Impression: Features suggestive of congestive cardiac failure. Recommend 2D Echo and cardiology review.`
  },
  {
    label: "Doctor's Note",
    text: `Dx: Type 2 Diabetes Mellitus, uncontrolled. HbA1c 9.8%. Advice: Continue Metformin 500mg BD with meals. Add Glipizide 5mg OD before breakfast. SMBG twice daily. Low glycaemic index diet. Avoid refined sugar. Brisk walk 30 min daily. Review in 6 weeks with repeat HbA1c and renal panel.`
  }
];

const SYSTEM_PROMPT = `You are a medical translator helping patients understand their clinical documents.

First, identify what type of document this is (e.g. Discharge Summary, Lab Report, Blood Test, Radiology Report, X-Ray, Prescription, Doctor's Note, etc.).

Then return ONLY a valid JSON object with these exact keys:
- "documentType": string — what type of clinical document this is, in plain English
- "summary": string — 2-4 plain-English sentences explaining what this document says and what it means for the patient. No jargon. If it's a lab report, mention which values are outside normal range and what that means simply.
- "medications": array of objects with keys: name, purpose, dose, frequency. Empty array if no medications mentioned.
- "followUp": array of strings — specific action items the patient should take.

No markdown, no backticks, no explanation. Just the raw JSON object.`;

const GREEN = "#0F6E56";
const GREEN_LIGHT = "#E1F5EE";
const BORDER = "#D4DDD9";

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Failed to read file"));
    r.readAsDataURL(file);
  });
}

function Card({ iconBg, icon, label, children }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #E2EDE9", borderRadius:12, padding:"1rem 1.25rem" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <div style={{ width:28, height:28, background:iconBg, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center" }}>{icon}</div>
        <span style={{ fontSize:11, fontWeight:600, color:"#6B7B74", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

export default function CareNote() {
  const [apiKey, setApiKey] = useState("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");
  const [apiKeySet, setApiKeySet] = useState(true);
  const [tab, setTab] = useState("upload");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState({});
  const [activeSample, setActiveSample] = useState(null);
  const fileRef = useRef();

  const reset = () => { setFile(null); setText(""); setResult(null); setError(""); setChecked({}); setActiveSample(null); };
  const toggleCheck = (i) => setChecked(c => ({ ...c, [i]: !c[i] }));

  const handleFile = async (f) => {
    if (!f) return;
    if (!["image/jpeg","image/png","image/jpg","image/webp","application/pdf"].includes(f.type)) {
      setError("Please upload a JPG, PNG, or PDF."); return;
    }
    setError("");
    const base64 = await fileToBase64(f);
    const preview = f.type !== "application/pdf" ? URL.createObjectURL(f) : null;
    setFile({ name:f.name, type:f.type, base64, preview });
    setResult(null); setChecked({});
  };

  const buildMessages = () => {
    const prompt = "Please read this clinical document and convert it into a patient-friendly guide. Auto-detect the document type.";
    if (file) {
      const blocks = [];
      if (file.type === "application/pdf") {
        blocks.push({ type:"document", source:{ type:"base64", media_type:"application/pdf", data:file.base64 } });
      } else {
        blocks.push({ type:"image", source:{ type:"base64", media_type:file.type, data:file.base64 } });
      }
      blocks.push({ type:"text", text: prompt });
      return [{ role:"user", content: blocks }];
    }
    return [{ role:"user", content:`${prompt}\n\n${text.trim()}` }];
  };

  const analyze = async () => {
    if (!file && !text.trim()) { setError("Please upload a document or paste text first."); return; }
    setLoading(true); setError(""); setResult(null); setChecked({});
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000, system:SYSTEM_PROMPT, messages:buildMessages() })
      });
      if (!res.ok) { const t = await res.text(); throw new Error(`API error ${res.status}: ${t.slice(0,200)}`); }
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const raw = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      const clean = raw.replace(/^```json\s*/,"").replace(/^```\s*/,"").replace(/```\s*$/,"").trim();
      setResult(JSON.parse(clean));
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const canSubmit = !loading && (!!file || !!text.trim());

  // API Key setup screen
  if (!apiKeySet) {
    return (
      <div style={{ fontFamily:"'DM Sans',sans-serif", maxWidth:480, margin:"0 auto", padding:"4rem 1.5rem", minHeight:"100vh", background:"#F8FAF9", display:"flex", flexDirection:"column", justifyContent:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:"0.5rem" }}>
          <div style={{ width:36, height:36, background:GREEN, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="18" height="18" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <span style={{ fontSize:22, fontWeight:600, color:"#111" }}>Care<span style={{ color:GREEN }}>Note</span></span>
        </div>
        <p style={{ fontSize:13, color:"#6B7B74", marginBottom:"2rem", marginLeft:46 }}>
          Explain any clinical document in plain language
        </p>

        <div style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:12, padding:"1.5rem" }}>
          <p style={{ fontSize:14, fontWeight:600, color:"#111", marginBottom:6 }}>Enter your Anthropic API key to get started</p>
          <p style={{ fontSize:12, color:"#9DB5AE", marginBottom:16, lineHeight:1.6 }}>
            Get a free key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color:GREEN }}>console.anthropic.com</a>. Your key is never stored or sent anywhere except directly to Anthropic.
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => e.key === "Enter" && apiKey.startsWith("sk-") && setApiKeySet(true)}
            placeholder="sk-ant-..."
            style={{ width:"100%", padding:"10px 12px", fontSize:14, border:`1px solid ${BORDER}`, borderRadius:8,
              fontFamily:"monospace", outline:"none", marginBottom:12, boxSizing:"border-box" }}
          />
          <button
            onClick={() => setApiKeySet(true)}
            disabled={!apiKey.startsWith("sk-")}
            style={{ width:"100%", padding:"10px 0", fontSize:14, fontWeight:600,
              background: apiKey.startsWith("sk-") ? GREEN : "#9DB5AE",
              color:"#fff", border:"none", borderRadius:8, cursor: apiKey.startsWith("sk-") ? "pointer" : "not-allowed" }}>
            Get started
          </button>
        </div>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap'); * { box-sizing: border-box; }`}</style>
      </div>
    );
  }

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", maxWidth:640, margin:"0 auto", padding:"2rem 1rem", background:"#F8FAF9", minHeight:"100vh" }}>

      {/* Header */}
      <div style={{ marginBottom:"1.75rem" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
          <div style={{ width:36, height:36, background:GREEN, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="18" height="18" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <span style={{ fontSize:22, fontWeight:600, color:"#111" }}>Care<span style={{ color:GREEN }}>Note</span></span>
          <button onClick={() => { setApiKeySet(false); setApiKey(""); reset(); }}
            style={{ marginLeft:"auto", fontSize:12, color:"#9DB5AE", background:"none", border:`1px solid ${BORDER}`, borderRadius:6, padding:"4px 10px", cursor:"pointer" }}>
            Change API key
          </button>
        </div>
        <p style={{ fontSize:13, color:"#6B7B74", marginLeft:46 }}>
          Upload any clinical document — lab report, discharge summary, X-ray, prescription. Get a plain-language guide instantly.
        </p>
      </div>

      {/* Input tabs */}
      <div style={{ display:"flex", marginBottom:"0.75rem", borderBottom:`1px solid ${BORDER}` }}>
        {[["upload","📷  Upload photo / PDF"],["paste","  Paste text"]].map(([val,label]) => (
          <button key={val} onClick={() => { setTab(val); reset(); }}
            style={{ padding:"8px 16px", fontSize:13, background:"none", border:"none", cursor:"pointer",
              color:tab===val?GREEN:"#6B7B74", fontWeight:tab===val?600:400,
              borderBottom:tab===val?`2px solid ${GREEN}`:"2px solid transparent", marginBottom:-1, transition:"all 0.15s" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Upload zone */}
      {tab === "upload" && (
        !file ? (
          <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
            onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0]);}}
            onClick={()=>fileRef.current.click()}
            style={{ border:`2px dashed ${drag?GREEN:BORDER}`, borderRadius:12, padding:"2.5rem 1rem",
              background:drag?GREEN_LIGHT:"#fff", textAlign:"center", cursor:"pointer", transition:"all 0.15s" }}>
            <div style={{ width:48, height:48, background:GREEN_LIGHT, borderRadius:12, margin:"0 auto 12px", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="22" height="22" fill="none" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p style={{ fontSize:14, fontWeight:600, color:"#111", marginBottom:6 }}>Tap to upload or drag & drop</p>
            <p style={{ fontSize:12, color:"#9DB5AE", marginBottom:12 }}>JPG, PNG or PDF — any hospital document</p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, justifyContent:"center" }}>
              {["Lab Report","X-Ray / Scan","Discharge Summary","Prescription","Doctor's Note"].map(t => (
                <span key={t} style={{ fontSize:11, color:"#6B7B74", background:"#F0F5F3", padding:"3px 10px", borderRadius:20 }}>{t}</span>
              ))}
            </div>
            <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])} />
          </div>
        ) : (
          <div style={{ border:`1px solid ${BORDER}`, borderRadius:12, padding:"1rem", background:"#fff", display:"flex", alignItems:"center", gap:12 }}>
            {file.preview
              ? <img src={file.preview} alt="preview" style={{ width:56, height:56, objectFit:"cover", borderRadius:8, border:`1px solid ${BORDER}` }}/>
              : <div style={{ width:56, height:56, background:"#FEF2F2", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="24" height="24" fill="none" stroke="#B91C1C" strokeWidth="1.8" strokeLinecap="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
            }
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontSize:13, fontWeight:600, color:"#111", marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{file.name}</p>
              <p style={{ fontSize:12, color:"#9DB5AE" }}>Document type will be auto-detected</p>
            </div>
            <button onClick={()=>setFile(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"#9DB5AE", fontSize:18 }}>✕</button>
          </div>
        )
      )}

      {/* Paste text */}
      {tab === "paste" && (
        <div>
          <textarea value={text} onChange={e=>{setText(e.target.value);setActiveSample(null);}}
            placeholder="Paste any clinical text — lab report, discharge summary, X-ray report, prescription..."
            style={{ width:"100%", minHeight:150, padding:"12px 14px", fontSize:14, lineHeight:1.65,
              border:`1px solid ${BORDER}`, borderRadius:10, background:"#fff", color:"#111", resize:"vertical", fontFamily:"inherit", outline:"none" }} />
          <p style={{ fontSize:12, color:"#9DB5AE", margin:"8px 0 6px" }}>Try a sample:</p>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {SAMPLES.map((s,i) => (
              <button key={i} onClick={()=>{ setText(s.text); setActiveSample(i); setResult(null); setError(""); }}
                style={{ fontSize:12, padding:"5px 12px", borderRadius:20, cursor:"pointer", transition:"all 0.15s",
                  background:activeSample===i?GREEN_LIGHT:"#fff",
                  border:activeSample===i?`1.5px solid ${GREEN}`:`1px solid ${BORDER}`,
                  color:activeSample===i?GREEN:"#6B7B74", fontWeight:activeSample===i?600:400 }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Submit */}
      <div style={{ display:"flex", alignItems:"center", marginTop:12 }}>
        <button onClick={analyze} disabled={!canSubmit}
          style={{ marginLeft:"auto", padding:"10px 24px", fontSize:14, fontWeight:600,
            background:canSubmit?GREEN:"#7EC4B0", color:"#fff", border:"none", borderRadius:10,
            cursor:canSubmit?"pointer":"not-allowed", display:"flex", alignItems:"center", gap:8, transition:"background 0.15s" }}>
          {loading
            ? <><svg width="14" height="14" viewBox="0 0 24 24" style={{ animation:"spin 0.8s linear infinite" }}><circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/><path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"/></svg>{file?"Reading document...":"Translating..."}</>
            : <><span style={{ fontSize:15 }}>✦</span> Explain this document</>
          }
        </button>
      </div>

      {error && <div style={{ marginTop:12, padding:"10px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10, fontSize:13, color:"#B91C1C", lineHeight:1.5 }}>{error}</div>}

      {/* Results */}
      {result && (
        <div style={{ marginTop:"1.5rem", display:"flex", flexDirection:"column", gap:12 }}>
          {result.documentType && (
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:GREEN }}></div>
              <span style={{ fontSize:13, color:"#6B7B74" }}>Detected: </span>
              <span style={{ fontSize:13, fontWeight:600, color:GREEN }}>{result.documentType}</span>
            </div>
          )}

          <Card iconBg="#E1F5EE" label="What this means for you"
            icon={<svg width="14" height="14" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}>
            <p style={{ fontSize:15, color:"#111", lineHeight:1.75, margin:0 }}>{result.summary}</p>
          </Card>

          {result.medications?.length > 0 && (
            <Card iconBg="#FAEEDA" label="Your medications"
              icon={<svg width="14" height="14" fill="none" stroke="#854F0B" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>}>
              {result.medications.map((med,i) => (
                <div key={i} style={{ paddingTop:i===0?0:10, paddingBottom:i<result.medications.length-1?10:0, borderBottom:i<result.medications.length-1?"1px solid #F0F5F3":"none" }}>
                  <div style={{ fontSize:14, fontWeight:600, color:"#111", marginBottom:3 }}>{med.name}</div>
                  <div style={{ fontSize:13, color:"#6B7B74", lineHeight:1.55 }}>{med.purpose} — {med.dose}, {med.frequency}</div>
                </div>
              ))}
            </Card>
          )}

          {result.followUp?.length > 0 && (
            <Card iconBg="#E6F1FB" label="What to do next"
              icon={<svg width="14" height="14" fill="none" stroke="#185FA5" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>}>
              {result.followUp.map((item,i) => (
                <div key={i} onClick={()=>toggleCheck(i)}
                  style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"8px 0", cursor:"pointer", borderBottom:i<result.followUp.length-1?"1px solid #F0F5F3":"none" }}>
                  <div style={{ width:18, height:18, minWidth:18, borderRadius:"50%", marginTop:2,
                    background:checked[i]?GREEN:"transparent", border:checked[i]?"none":"1.5px solid #C4D4CE",
                    display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s" }}>
                    {checked[i] && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="2,6 5,9 10,3"/></svg>}
                  </div>
                  <span style={{ fontSize:14, color:checked[i]?"#9DB5AE":"#111", textDecoration:checked[i]?"line-through":"none", lineHeight:1.55, transition:"all 0.15s" }}>{item}</span>
                </div>
              ))}
            </Card>
          )}
          <p style={{ fontSize:11, color:"#9DB5AE", textAlign:"center", marginTop:4 }}>For informational purposes only. Always follow your doctor's advice.</p>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        textarea:focus { outline:none; border-color:${GREEN} !important; box-shadow: 0 0 0 3px rgba(15,110,86,0.1); }
      `}</style>
    </div>
  );
}
