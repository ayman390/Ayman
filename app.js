
/* Luggage Share SPA using localStorage */

const PRICE_PER_KG = 40;     // AED
const ADMIN_FEE_PER_KG = 19; // AED
const CARRIER_PAYOUT_PER_KG = PRICE_PER_KG - ADMIN_FEE_PER_KG; // 21

/* ---------- Helpers ---------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function lsGet(key, fallback){
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch(e){ return fallback; }
}
function lsSet(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
function toDataURL(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function id(){ return crypto.randomUUID(); }
function formatAED(n){ return new Intl.NumberFormat('ar-AE', {style:'currency', currency:'AED'}).format(n); }

/* ---------- State ---------- */
const state = {
  me: lsGet('me', null),
  users: lsGet('users', []),
  seekerPosts: lsGet('seekerPosts', []),   // {id, userId, from, to, flight, date, kg, total, docs{passport,id,photo}}
  carrierPosts: lsGet('carrierPosts', []), // {id, userId, from, to, flight, date, kg, revenue, docs{passport,id,photo}}
  deals: lsGet('deals', []),               // {id, seekerId, carrierId, kg, total, status, chat:[], timelineIdx}
};

/* ---------- Views ---------- */
function switchView(viewId){
  $$('.view').forEach(v=>v.classList.remove('active'));
  $('#'+viewId).classList.add('active');
}
$$('.nav-btn').forEach(btn=>btn.addEventListener('click', e=>{
  switchView(btn.dataset.view);
  if(btn.dataset.view==='adminView') renderAdmin();
  if(btn.dataset.view==='seekerView') { renderMatchingCarriers(); renderMyDeals('seeker'); }
  if(btn.dataset.view==='carrierView') { renderMatchingSeekers(); renderMyDeals('carrier'); }
}));

/* ---------- Auth ---------- */
const roleSelect = $('#roleSelect');
const displayName = $('#displayName');
const profilePhoto = $('#profilePhoto');
const profilePhotoPreview = $('#profilePhotoPreview');
const btnLogin = $('#btnLogin');
const myProfile = $('#myProfile');

profilePhoto.addEventListener('change', async () => {
  if(profilePhoto.files[0]) {
    const data = await toDataURL(profilePhoto.files[0]);
    profilePhotoPreview.src = data;
  }
});

btnLogin.addEventListener('click', async () => {
  const role = roleSelect.value;
  const name = displayName.value.trim() || 'مستخدم';
  let photo = profilePhotoPreview.src || '';

  // upsert user
  let me = state.me;
  if(!me){
    me = { id: id(), role, name, photo };
    state.users.push(me);
  }else{
    me.role = role; me.name = name;
    if(photo) me.photo = photo;
  }
  state.me = me;
  persist();

  renderProfile();
  alert('تم تسجيل الدخول/التحديث بنجاح.');
});

function renderProfile(){
  if(!state.me){ myProfile.innerHTML = '<p class="muted">لم تسجل الدخول بعد.</p>'; return; }
  myProfile.innerHTML = `
    <div class="item">
      <div class="row" style="align-items:center">
        <img src="${state.me.photo||'assets/icon.png'}" style="width:60px;height:60px;border-radius:10px;object-fit:cover">
        <div>
          <div><b>الاسم:</b> ${state.me.name}</div>
          <div><b>الدور:</b> ${state.me.role}</div>
          <div class="muted small">المعرف: ${state.me.id}</div>
        </div>
      </div>
    </div>
  `;
}
renderProfile();

/* ---------- Seeker ---------- */
const seekKg = $('#seekKg');
const seekTotal = $('#seekTotal');
seekKg.addEventListener('input', ()=>{
  seekTotal.value = (Number(seekKg.value||0) * PRICE_PER_KG).toFixed(2);
});
seekTotal.value = (Number(seekKg.value||0) * PRICE_PER_KG).toFixed(2);

async function fileToThumb(input, prevSel){
  if(input.files[0]){
    const data = await toDataURL(input.files[0]);
    $(prevSel).innerHTML = input.files[0].type.includes('image') ? `<img src="${data}">` : `<span>تم رفع ملف</span>`;
    return data;
  }
  return '';
}
$('#seekPassport').addEventListener('change', ()=>fileToThumb($('#seekPassport'), '#seekPassportPrev'));
$('#seekID').addEventListener('change', ()=>fileToThumb($('#seekID'), '#seekIDPrev'));
$('#seekPhoto').addEventListener('change', ()=>fileToThumb($('#seekPhoto'), '#seekPhotoPrev'));

$('#btnSeekPost').addEventListener('click', async ()=>{
  if(!state.me){ alert('سجل الدخول أولاً.'); return; }
  const post = {
    id: id(),
    userId: state.me.id,
    from: $('#seekFrom').value.trim(),
    to: $('#seekTo').value.trim(),
    flight: $('#seekFlight').value.trim(),
    date: $('#seekDate').value,
    kg: Number($('#seekKg').value||0),
    total: Number($('#seekKg').value||0)*PRICE_PER_KG,
    docs: {
      passport: await (async()=> await fileToThumb($('#seekPassport'), '#seekPassportPrev'))(),
      id: await (async()=> await fileToThumb($('#seekID'), '#seekIDPrev'))(),
      photo: await (async()=> await fileToThumb($('#seekPhoto'), '#seekPhotoPrev'))(),
    }
  };
  state.seekerPosts.push(post);
  persist();
  renderMatchingCarriers();
  renderAdmin();
  alert('تم نشر الطلب.');
});

function renderMatchingCarriers(){
  const wrap = $('#matchingCarriers');
  const me = state.me;
  const myPosts = state.seekerPosts.filter(p=>p.userId===me?.id);
  const carriers = state.carrierPosts.filter(c=> myPosts.some(p=>p.from && p.to && p.date && c.from===p.from && c.to===p.to && c.date===p.date));
  if(carriers.length===0){ wrap.innerHTML = '<p class="muted">لا توجد عروض مطابقة بعد.</p>'; return; }
  wrap.innerHTML = carriers.map(c=>{
    const user = state.users.find(u=>u.id===c.userId) || {name:'مستخدم'};
    return `
      <div class="item">
        <div><b>${user.name}</b> — رحلة ${c.flight} في ${c.date}</div>
        <div class="row">
          <span class="badge">من ${c.from}</span>
          <span class="badge">إلى ${c.to}</span>
          <span class="badge">متاح: ${c.kg} كجم</span>
          <span class="badge">عائد الحامل: ${formatAED(c.revenue)}</span>
        </div>
        <div class="actions">
          <button onclick="requestDeal('${c.id}')">اطلب مشاركة</button>
        </div>
      </div>
    `;
  }).join('');
}

window.requestDeal = function(carrierPostId){
  if(!state.me){ alert('سجل الدخول أولاً.'); return; }
  const carrierPost = state.carrierPosts.find(c=>c.id===carrierPostId);
  const mePost = state.seekerPosts.find(p=>p.userId===state.me.id && p.from===carrierPost.from && p.to===carrierPost.to && p.date===carrierPost.date);
  if(!mePost){ alert('لم يتم العثور على طلبك المطابق.'); return; }
  const kg = Math.min(mePost.kg, carrierPost.kg);
  const deal = {
    id: id(),
    seekerId: mePost.userId,
    carrierId: carrierPost.userId,
    kg,
    total: kg * PRICE_PER_KG,
    status: 'Proposed',
    timelineIdx: 0,
    chat: []
  };
  state.deals.push(deal);
  persist();
  renderMyDeals('seeker');
  renderAdmin();
  alert('تم إرسال الطلب للحامل. بانتظار الموافقة.');
}

function renderMyDeals(role){
  const me = state.me;
  const listEl = role==='seeker' ? $('#seekerDeals') : $('#carrierDeals');
  const myDeals = state.deals.filter(d => role==='seeker' ? d.seekerId===me?.id : d.carrierId===me?.id);
  if(myDeals.length===0){ listEl.innerHTML = '<p class="muted">لا توجد اتفاقيات بعد.</p>'; return; }
  listEl.innerHTML = myDeals.map(d=> dealItemHTML(d, role)).join('');
}

function dealItemHTML(d, role){
  const seeker = state.users.find(u=>u.id===d.seekerId) || {name:'Seeker'};
  const carrier = state.users.find(u=>u.id===d.carrierId) || {name:'Carrier'};
  const adminShare = d.kg * ADMIN_FEE_PER_KG;
  const carrierShare = d.kg * CARRIER_PAYOUT_PER_KG;
  const statusBadge = `<span class="badge">${d.status}</span>`;
  return `
    <div class="item">
      <div><b>الحامل:</b> ${carrier.name} — <b>الباحث:</b> ${seeker.name} ${statusBadge}</div>
      <div class="row">
        <span class="badge">الوزن: ${d.kg} كجم</span>
        <span class="badge">إجمالي: ${formatAED(d.total)}</span>
        <span class="badge">عمولة المشرف: ${formatAED(adminShare)}</span>
        <span class="badge">حصة الحامل: ${formatAED(carrierShare)}</span>
      </div>
      <div class="actions">
        ${role==='carrier' && d.status==='Proposed' ? `<button onclick="acceptDeal('${d.id}')">قبول</button>`:''}
        ${d.status!=='Delivered' ? `<button onclick="advanceDeal('${d.id}')">تقدم الحالة</button>`:''}
        <button onclick="openChat('${d.id}')">محادثة</button>
        <button onclick="selectDealProgress('${d.id}')">عرض التتبع</button>
      </div>
    </div>
  `;
}

window.acceptDeal = function(dealId){
  const d = state.deals.find(x=>x.id===dealId);
  if(!d) return;
  d.status = 'Accepted';
  d.timelineIdx = 1;
  persist();
  renderMyDeals('carrier');
  renderMyDeals('seeker');
  renderAdmin();
  alert('تم القبول. تم فتح المحادثة.');
  openChat(dealId);
}

window.advanceDeal = function(dealId){
  const d = state.deals.find(x=>x.id===dealId);
  if(!d) return;
  const steps = ['Proposed','Accepted','In Transit','Delivered','Released'];
  d.timelineIdx = Math.min(d.timelineIdx+1, steps.length-1);
  d.status = steps[d.timelineIdx];
  persist();
  renderMyDeals('carrier');
  renderMyDeals('seeker');
  renderAdmin();
  if(d.status==='Released') alert('تم الإفراج عن المبلغ وفق الحالة.');
}

window.selectDealProgress = function(dealId){
  const d = state.deals.find(x=>x.id===dealId);
  drawProgress(d?.timelineIdx ?? 0);
}

/* ---------- Carrier ---------- */
const carKg = $('#carKg');
const carRevenue = $('#carRevenue');
carKg.addEventListener('input', ()=>{
  carRevenue.value = (Number(carKg.value||0)*CARRIER_PAYOUT_PER_KG).toFixed(2);
});
carRevenue.value = (Number(carKg.value||0)*CARRIER_PAYOUT_PER_KG).toFixed(2);

$('#carPassport').addEventListener('change', ()=>fileToThumb($('#carPassport'), '#carPassportPrev'));
$('#carID').addEventListener('change', ()=>fileToThumb($('#carID'), '#carIDPrev'));
$('#carPhoto').addEventListener('change', ()=>fileToThumb($('#carPhoto'), '#carPhotoPrev'));

$('#btnCarPost').addEventListener('click', async ()=>{
  if(!state.me){ alert('سجل الدخول أولاً.'); return; }
  const post = {
    id: id(),
    userId: state.me.id,
    from: $('#carFrom').value.trim(),
    to: $('#carTo').value.trim(),
    flight: $('#carFlight').value.trim(),
    date: $('#carDate').value,
    kg: Number($('#carKg').value||0),
    revenue: Number($('#carKg').value||0)*CARRIER_PAYOUT_PER_KG,
    docs: {
      passport: await (async()=> await fileToThumb($('#carPassport'), '#carPassportPrev'))(),
      id: await (async()=> await fileToThumb($('#carID'), '#carIDPrev'))(),
      photo: await (async()=> await fileToThumb($('#carPhoto'), '#carPhotoPrev'))(),
    }
  };
  state.carrierPosts.push(post);
  persist();
  renderMatchingSeekers();
  renderAdmin();
  alert('تم نشر العرض.');
});

function renderMatchingSeekers(){
  const wrap = $('#matchingSeekers');
  const me = state.me;
  const myPosts = state.carrierPosts.filter(p=>p.userId===me?.id);
  const seekers = state.seekerPosts.filter(s=> myPosts.some(p=>p.from && p.to && p.date && s.from===p.from && s.to===p.to && s.date===p.date));
  if(seekers.length===0){ wrap.innerHTML = '<p class="muted">لا توجد طلبات مطابقة بعد.</p>'; return; }
  wrap.innerHTML = seekers.map(s=>{
    const user = state.users.find(u=>u.id===s.userId) || {name:'مستخدم'};
    return `
      <div class="item">
        <div><b>${user.name}</b> — رحلة ${s.flight} في ${s.date}</div>
        <div class="row">
          <span class="badge">من ${s.from}</span>
          <span class="badge">إلى ${s.to}</span>
          <span class="badge">مطلوب: ${s.kg} كجم</span>
          <span class="badge">الإجمالي: ${formatAED(s.total)}</span>
        </div>
        <div class="actions">
          <button onclick="createDealForSeeker('${s.id}')">اقترح اتفاق</button>
        </div>
      </div>
    `;
  }).join('');
}

window.createDealForSeeker = function(seekerPostId){
  if(!state.me){ alert('سجل الدخول أولاً.'); return; }
  const seekerPost = state.seekerPosts.find(s=>s.id===seekerPostId);
  const myPost = state.carrierPosts.find(p=>p.userId===state.me.id && p.from===seekerPost.from && p.to===seekerPost.to && p.date===seekerPost.date);
  if(!myPost){ alert('لا يوجد عرض مطابق من جانبك.'); return; }
  const kg = Math.min(seekerPost.kg, myPost.kg);
  const deal = {
    id: id(),
    seekerId: seekerPost.userId,
    carrierId: myPost.userId,
    kg,
    total: kg * PRICE_PER_KG,
    status: 'Proposed',
    timelineIdx: 0,
    chat: []
  };
  state.deals.push(deal);
  persist();
  renderMyDeals('carrier');
  renderAdmin();
  alert('تم إرسال الاقتراح للباحث. بانتظار القبول.');
}

/* ---------- Admin ---------- */
function renderAdmin(){
  // stats
  $('#statUsers').innerText = state.users.length;
  $('#statDeals').innerText = state.deals.length;
  const adminRevenue = state.deals.reduce((a,d)=> a + d.kg*ADMIN_FEE_PER_KG, 0);
  $('#statRevenue').innerText = adminRevenue.toFixed(2);

  // lists
  $('#adminSeekers').innerHTML = state.seekerPosts.map(p=>`
    <div class="item">
      <div><b>مستخدم:</b> ${getUserName(p.userId)} — ${p.flight} (${p.date})</div>
      <div class="row">
        <span class="badge">من ${p.from}</span>
        <span class="badge">إلى ${p.to}</span>
        <span class="badge">مطلوب: ${p.kg} كجم</span>
        <span class="badge">إجمالي: ${formatAED(p.total)}</span>
      </div>
    </div>
  `).join('') || '<p class="muted">لا توجد طلبات.</p>';

  $('#adminCarriers').innerHTML = state.carrierPosts.map(p=>`
    <div class="item">
      <div><b>مستخدم:</b> ${getUserName(p.userId)} — ${p.flight} (${p.date})</div>
      <div class="row">
        <span class="badge">من ${p.from}</span>
        <span class="badge">إلى ${p.to}</span>
        <span class="badge">متاح: ${p.kg} كجم</span>
        <span class="badge">عائد الحامل: ${formatAED(p.revenue)}</span>
      </div>
    </div>
  `).join('') || '<p class="muted">لا توجد عروض.</p>';

  $('#adminDeals').innerHTML = state.deals.map(d=>`
    <div class="item">
      <div><b>الحامل:</b> ${getUserName(d.carrierId)} — <b>الباحث:</b> ${getUserName(d.seekerId)} — <span class="badge">${d.status}</span></div>
      <div class="row">
        <span class="badge">الوزن: ${d.kg} كجم</span>
        <span class="badge">الإجمالي: ${formatAED(d.kg*PRICE_PER_KG)}</span>
        <span class="badge">عمولة المشرف: ${formatAED(d.kg*ADMIN_FEE_PER_KG)}</span>
        <span class="badge">حصة الحامل: ${formatAED(d.kg*CARRIER_PAYOUT_PER_KG)}</span>
      </div>
      <div class="actions">
        <button onclick="selectDealProgress('${d.id}')">عرض التتبع</button>
        <button onclick="openChat('${d.id}')">محادثة</button>
      </div>
    </div>
  `).join('') || '<p class="muted">لا توجد اتفاقيات.</p>';
}

function getUserName(uid){ return (state.users.find(u=>u.id===uid)||{}).name || 'مستخدم'; }

/* ---------- Chat ---------- */
const chatModal = $('#chatModal');
const chatBody = $('#chatBody');
const chatText = $('#chatText');
$('#closeChat').addEventListener('click', ()=> chatModal.style.display='none');
$('#sendChat').addEventListener('click', sendChat);

let activeDealId = null;
function openChat(dealId){
  activeDealId = dealId;
  chatModal.style.display = 'flex';
  renderChat();
}
function renderChat(){
  const d = state.deals.find(x=>x.id===activeDealId);
  if(!d) return;
  chatBody.innerHTML = d.chat.map(m=>`
    <div class="msg ${m.userId===state.me?.id ? 'me' : 'other'}">
      <div class="small muted">${getUserName(m.userId)}</div>
      <div>${m.text}</div>
    </div>
  `).join('');
  chatBody.scrollTop = chatBody.scrollHeight;
}
function sendChat(){
  const txt = chatText.value.trim();
  if(!txt) return;
  const d = state.deals.find(x=>x.id===activeDealId);
  if(!d || !state.me){ return; }
  d.chat.push({ id:id(), userId: state.me.id, text: txt, ts: Date.now() });
  chatText.value='';
  persist();
  renderChat();
}

/* ---------- Progress (Canvas) ---------- */
const canvas = $('#dealProgress');
const ctx = canvas.getContext('2d');
function drawProgress(idx=0){
  const steps = ['Proposed','Accepted','In Transit','Delivered','Released'];
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  const padding = 40;
  const lineY = h/2;
  const stepGap = (w - 2*padding) / (steps.length-1);

  // line
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ddd';
  ctx.beginPath();
  ctx.moveTo(padding, lineY);
  ctx.lineTo(w - padding, lineY);
  ctx.stroke();

  // progress
  ctx.strokeStyle = '#7c3aed';
  ctx.beginPath();
  ctx.moveTo(padding, lineY);
  ctx.lineTo(padding + stepGap*idx, lineY);
  ctx.stroke();

  // dots + labels
  steps.forEach((s,i)=>{
    const x = padding + stepGap*i;
    ctx.beginPath();
    ctx.fillStyle = i<=idx ? '#7c3aed' : '#bbb';
    ctx.arc(x, lineY, 10, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s, x, lineY+30);
  });
}

/* ---------- Persistence ---------- */
function persist(){
  lsSet('me', state.me);
  lsSet('users', state.users);
  lsSet('seekerPosts', state.seekerPosts);
  lsSet('carrierPosts', state.carrierPosts);
  lsSet('deals', state.deals);
}

/* ---------- Init ---------- */
drawProgress(0);
renderAdmin();

// Simple routing defaults
switchView('authView');
