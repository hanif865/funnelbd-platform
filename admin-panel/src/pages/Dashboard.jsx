import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { fmtDate, money, num } from '../constants.js';
import { Pill, StatusPill, Empty } from '../components/ui.jsx';
import { FunnelFilter } from '../funnel.jsx';

const orders = (n) => `${num(n)} ${Number(n) === 1 ? 'order' : 'orders'}`;

function formatDwell(sec) {
  if (!sec || sec < 60) return `${Math.round(sec || 0)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${num(m)}m ${s}s`;
}

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [funnel, setFunnel] = useState('');
  useEffect(() => {
    setErr('');
    api('/dashboard', { params: { funnel } }).then(setD).catch((e) => setErr(e.message));
  }, [funnel]);

  if (err) return <p className="err">{err}</p>;
  if (!d) return <p className="muted">Loading…</p>;
  const { cards, incomplete, sources, series, recent, sectionAnalytics = [], todayDetail: td } = d;

  const totalExits = sectionAnalytics.reduce((sum, s) => sum + (s.exits || 0), 0);
  const maxExits = Math.max(0, ...sectionAnalytics.map((s) => s.exits || 0));
  const maxDwell = Math.max(1, ...sectionAnalytics.map((s) => s.dwellSeconds || 0));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="page-sub">Sales, conversion and where visitors drop off.</p>
        </div>
        <FunnelFilter value={funnel} onChange={setFunnel} />
      </div>

      {td && (
        <div className="card today-card">
          <div className="card-head">
            <h3>Today at a glance</h3>
            <span className="muted">Resets at midnight</span>
          </div>
          <div className="today-grid">
            <Mini label="Unique visitors" value={num(td.visitors)} />
            <Mini label="Total visits" value={num(td.visits)} />
            <Mini label="Orders" value={num(td.orders)} accent />
            <Mini label="Revenue" value={money(td.revenue)} accent />
            <Mini label="Call clicks" value={num(td.calls)} />
            <Mini label="WhatsApp clicks" value={num(td.whatsapp)} />
            <Mini label="Order-button clicks" value={num(td.orderClicks)} />
          </div>
        </div>
      )}

      <div className="stat-grid">
        <Stat label="Today" value={money(cards.today.revenue)} sub={orders(cards.today.orders)} />
        <Stat label="Yesterday" value={money(cards.yesterday.revenue)} sub={orders(cards.yesterday.orders)} />
        <Stat label="Last 7 days" value={money(cards.week.revenue)} sub={orders(cards.week.orders)} />
        <Stat label="Last 30 days" value={money(cards.month.revenue)} sub={orders(cards.month.orders)} accent />
        <Stat label="Avg. order value" value={money(cards.aov)} sub="Last 30 days" />
        <Stat label="Conversion rate" value={cards.conversionRate != null ? cards.conversionRate + '%' : '—'} sub={`${num(cards.visitors)} visitors`} />
        <Stat label="Incomplete (active)" value={num(incomplete.active)} sub={'Recovery ' + (incomplete.recoveryRate != null ? incomplete.recoveryRate + '%' : '—')} />
      </div>

      <div className="two-col dash-lower">
        <div className="card">
          <h3>Orders &amp; revenue — last 30 days</h3>
          <Chart series={series} />
        </div>
        <div className="card">
          <h3>Traffic sources — last 30 days</h3>
          {sources.length === 0 ? <Empty>No orders yet.</Empty> : (
            <table className="table mini"><tbody>
              {sources.map((s) => (
                <tr key={s._id}>
                  <td className="cell-strong">{s._id}</td>
                  <td className="num">{orders(s.count)}</td>
                  <td className="num cell-strong">{money(s.revenue)}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>

      {sectionAnalytics.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Landing page sections</h3>
              <p className="page-sub">Time visitors spend in each section, and the section they were on when they left.</p>
            </div>
            {totalExits > 0 && <Pill color="#dc2626">{num(totalExits)} exits total</Pill>}
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Time spent</th>
                  <th className="num">Views</th>
                  <th className="num">Exits</th>
                  <th>Share of exits</th>
                </tr>
              </thead>
              <tbody>
                {sectionAnalytics.map((sec) => {
                  const exitPct = totalExits > 0 ? Math.round((sec.exits / totalExits) * 100) : 0;
                  const isTopExit = maxExits > 0 && sec.exits === maxExits;
                  const dwellPct = Math.round(((sec.dwellSeconds || 0) / maxDwell) * 100);

                  return (
                    <tr key={sec.key}>
                      <td className="cell-strong">
                        {sec.label} {isTopExit && <Pill color="#dc2626" small>Top exit</Pill>}
                      </td>
                      <td>
                        <div className="meter-cell">
                          <span style={{ minWidth: 62 }}>{formatDwell(sec.dwellSeconds)}</span>
                          <span className="meter"><span style={{ width: `${dwellPct}%`, background: '#3b82f6' }} /></span>
                        </div>
                      </td>
                      <td className="num">{num(sec.views || 0)}</td>
                      <td className="num" style={{ color: sec.exits > 0 ? '#dc2626' : undefined, fontWeight: 600 }}>{num(sec.exits || 0)}</td>
                      <td>
                        <div className="meter-cell">
                          <span style={{ minWidth: 34 }}>{exitPct}%</span>
                          <span className="meter"><span style={{ width: `${exitPct}%`, background: exitPct > 30 ? '#ef4444' : '#f59e0b' }} /></span>
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

      <div className="card">
        <div className="card-head">
          <h3>Latest orders</h3>
          <Link to="/orders" className="btn-ghost sm">View all</Link>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Order</th><th>Customer</th><th>Phone</th><th className="num">Total</th><th>Status</th><th>Placed</th></tr></thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o._id}>
                  <td><Link to={'/orders/' + o._id} className="cell-strong">#{o.orderNumber}</Link></td>
                  <td>{o.customer?.name}</td>
                  <td>{o.customer?.phone}</td>
                  <td className="num cell-strong">{money(o.total)}</td>
                  <td><StatusPill status={o.status} /></td>
                  <td className="muted">{fmtDate(o.createdAt)}</td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td colSpan="6" className="muted">No orders yet.</td></tr>}
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

function Mini({ label, value, accent }) {
  return (
    <div className={'today-tile' + (accent ? ' accent' : '')}>
      <div className="today-tile-value">{value}</div>
      <div className="today-tile-label">{label}</div>
    </div>
  );
}

/** Dependency-free SVG chart: orders as bars, revenue as a line. */
function Chart({ series }) {
  const W = 560, H = 190, pad = 24;
  const maxOrders = Math.max(1, ...series.map((s) => s.orders));
  const maxRev = Math.max(1, ...series.map((s) => s.revenue));
  const bw = (W - pad * 2) / series.length;
  const x = (i) => pad + i * bw;
  const yO = (v) => H - pad - (v / maxOrders) * (H - pad * 2);
  const yR = (v) => H - pad - (v / maxRev) * (H - pad * 2);
  const line = series.map((s, i) => `${x(i) + bw / 2},${yR(s.revenue)}`).join(' ');

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Orders and revenue for the last 30 days">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad} x2={W - pad} y1={pad + (H - pad * 2) * f} y2={pad + (H - pad * 2) * f} stroke="#eef2f6" />
        ))}
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#e2e8f0" />
        {series.map((s, i) => (
          <rect key={i} x={x(i) + 2} y={yO(s.orders)} width={Math.max(1, bw - 4)} height={H - pad - yO(s.orders)} rx="2" fill="#e11d48" opacity="0.8">
            <title>{s.date}: {s.orders} orders, {money(s.revenue)}</title>
          </rect>
        ))}
        <polyline points={line} fill="none" stroke="#0d9488" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div className="chart-legend">
        <span><i style={{ background: '#e11d48' }} />Orders</span>
        <span><i style={{ background: '#0d9488' }} />Revenue</span>
      </div>
    </div>
  );
}
