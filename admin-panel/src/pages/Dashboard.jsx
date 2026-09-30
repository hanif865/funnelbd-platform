import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { STATUS_MAP, bnDate } from '../constants.js';

const bn = (n) => String(n ?? 0).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);

function formatDwell(sec) {
  if (!sec || sec < 60) return `${bn(Math.round(sec || 0))} সেকেণ্ড`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${bn(m)} মি. ${bn(s)} সে.`;
}

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/dashboard').then(setD).catch((e) => setErr(e.message)); }, []);

  if (err) return <p className="err">{err}</p>;
  if (!d) return <p className="muted">লোড হচ্ছে…</p>;
  const { cards, incomplete, sources, series, recent, sectionAnalytics = [] } = d;

  const totalExits = sectionAnalytics.reduce((sum, s) => sum + (s.exits || 0), 0);
  const maxDwell = Math.max(1, ...sectionAnalytics.map((s) => s.dwellSeconds || 0));

  return (
    <div>
      <div className="page-head"><h1>ড্যাশবোর্ড</h1></div>

      <div className="stat-grid">
        <Stat label="আজ" value={bn(cards.today.orders) + ' অর্ডার'} sub={bn(cards.today.revenue) + '৳'} />
        <Stat label="গতকাল" value={bn(cards.yesterday.orders) + ' অর্ডার'} sub={bn(cards.yesterday.revenue) + '৳'} />
        <Stat label="৭ দিন" value={bn(cards.week.orders) + ' অর্ডার'} sub={bn(cards.week.revenue) + '৳'} />
        <Stat label="৩০ দিন" value={bn(cards.month.orders) + ' অর্ডার'} sub={bn(cards.month.revenue) + '৳'} accent />
        <Stat label="গড় অর্ডার (AOV)" value={bn(cards.aov) + '৳'} />
        <Stat label="কনভার্সন রেট" value={cards.conversionRate != null ? bn(cards.conversionRate) + '%' : '—'} sub={bn(cards.visitors) + ' ভিজিটর'} />
        <Stat label="অসম্পূর্ণ (সক্রিয়)" value={bn(incomplete.active)} sub={'রিকভারি ' + (incomplete.recoveryRate != null ? bn(incomplete.recoveryRate) + '%' : '—')} />
      </div>

      <div className="two-col dash-lower">
        <div className="card">
          <h3>গত ৩০ দিনের অর্ডার ও রেভিনিউ</h3>
          <Chart series={series} />
        </div>
        <div className="card">
          <h3>সোর্স ব্রেকডাউন (৩০ দিন)</h3>
          {sources.length === 0 ? <p className="muted">ডেটা নেই।</p> : (
            <table className="table mini"><tbody>
              {sources.map((s) => (
                <tr key={s._id}><td>{s._id}</td><td>{bn(s.count)} অর্ডার</td><td>{bn(s.revenue)}৳</td></tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>

      {sectionAnalytics.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ margin: 0 }}>📊 সেকশন অ্যানালিটিক্স ও ড্রপ-অফ রিপোর্ট (Section Dwell & Bounce)</h3>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
                ভিজিটররা কোন সেকশনে বেশি সময় কাটিয়েছে এবং কোন সেকশন থেকে পেজ ত্যাগ (Exit) করেছে।
              </p>
            </div>
            {totalExits > 0 && (
              <span className="pill" style={{ background: '#ef4444' }}>
                মোট ড্রপ-অফ / এক্সিট: {bn(totalExits)} জন
              </span>
            )}
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>সেকশন নাম</th>
                  <th>মোট সময় (Dwell Time)</th>
                  <th>ভিজিটর ভিউ</th>
                  <th>পেজ ত্যাগ / ড্রপ-অফ (Exits)</th>
                  <th>ড্রপ-অফ অনুপাত</th>
                </tr>
              </thead>
              <tbody>
                {sectionAnalytics.map((sec) => {
                  const exitPct = totalExits > 0 ? Math.round((sec.exits / totalExits) * 100) : 0;
                  const isTopExit = totalExits > 0 && sec.exits > 0 && sec.exits === Math.max(...sectionAnalytics.map((s) => s.exits));
                  const dwellPct = Math.round(((sec.dwellSeconds || 0) / maxDwell) * 100);

                  return (
                    <tr key={sec.key}>
                      <td style={{ fontWeight: 600 }}>
                        {sec.label}
                        {isTopExit && (
                          <span className="pill sm" style={{ background: '#ef4444', marginLeft: 8, fontSize: '0.68rem' }}>
                            সর্বোচ্চ ড্রপ-অফ
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ minWidth: 70 }}>{formatDwell(sec.dwellSeconds)}</span>
                          <div style={{ width: 80, height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${dwellPct}%`, height: '100%', background: '#3b82f6', borderRadius: 4 }} />
                          </div>
                        </div>
                      </td>
                      <td>{bn(sec.views || 0)} বার</td>
                      <td>
                        <strong style={{ color: sec.exits > 0 ? '#ef4444' : 'inherit' }}>
                          {bn(sec.exits || 0)} জন
                        </strong>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{bn(exitPct)}%</span>
                          <div style={{ width: 60, height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${exitPct}%`, height: '100%', background: exitPct > 30 ? '#ef4444' : '#f59e0b', borderRadius: 4 }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3>সর্বশেষ ১০ অর্ডার</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>অর্ডার</th><th>নাম</th><th>ফোন</th><th>টোটাল</th><th>স্ট্যাটাস</th><th>সময়</th></tr></thead>
            <tbody>
              {recent.map((o) => {
                const st = STATUS_MAP[o.status] || {};
                return (
                  <tr key={o._id}>
                    <td><Link to={'/orders/' + o._id}>#{o.orderNumber}</Link></td>
                    <td>{o.customer?.name}</td><td>{o.customer?.phone}</td><td>{o.total}৳</td>
                    <td><span className="pill" style={{ background: st.color }}>{st.label}</span></td>
                    <td className="muted">{bnDate(o.createdAt)}</td>
                  </tr>
                );
              })}
              {recent.length === 0 && <tr><td colSpan="6" className="muted">এখনো কোনো অর্ডার নেই।</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }) {
  return (
    <div className={'stat-card' + (accent ? ' accent' : '')}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** Dependency-free SVG bar chart: orders as bars, revenue as a line. */
function Chart({ series }) {
  const W = 560, H = 180, pad = 24;
  const maxOrders = Math.max(1, ...series.map((s) => s.orders));
  const maxRev = Math.max(1, ...series.map((s) => s.revenue));
  const bw = (W - pad * 2) / series.length;
  const x = (i) => pad + i * bw;
  const yO = (v) => H - pad - (v / maxOrders) * (H - pad * 2);
  const yR = (v) => H - pad - (v / maxRev) * (H - pad * 2);
  const line = series.map((s, i) => `${x(i) + bw / 2},${yR(s.revenue)}`).join(' ');

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart">
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#e5e9ef" />
        {series.map((s, i) => (
          <rect key={i} x={x(i) + 2} y={yO(s.orders)} width={Math.max(1, bw - 4)} height={H - pad - yO(s.orders)} fill="#e63946" opacity="0.75">
            <title>{s.date}: {s.orders} অর্ডার, {s.revenue}৳</title>
          </rect>
        ))}
        <polyline points={line} fill="none" stroke="#2a9d8f" strokeWidth="2" />
      </svg>
      <div className="chart-legend"><span className="lg lg-o">▮ অর্ডার</span><span className="lg lg-r">▬ রেভিনিউ</span></div>
    </div>
  );
}
