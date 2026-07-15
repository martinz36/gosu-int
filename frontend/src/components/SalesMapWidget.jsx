import { useState, useCallback, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';

// ─── ISO 3 → display name lookup ───────────────────────────────────────────
const ISO3_TO_NAME = {
  USA: 'Estados Unidos', MEX: 'México', CAN: 'Canadá', GTM: 'Guatemala',
  HND: 'Honduras', SLV: 'El Salvador', NIC: 'Nicaragua', CRI: 'Costa Rica',
  PAN: 'Panamá', CUB: 'Cuba', DOM: 'República Dominicana', PRY: 'Paraguay',
  HTI: 'Haití', JAM: 'Jamaica', TTO: 'Trinidad y Tobago',
  COL: 'Colombia', VEN: 'Venezuela', ECU: 'Ecuador', PER: 'Perú',
  BOL: 'Bolivia', CHL: 'Chile', ARG: 'Argentina', URY: 'Uruguay',
  BRA: 'Brasil', GUY: 'Guyana', SUR: 'Surinam',
  ESP: 'España', PRT: 'Portugal', FRA: 'Francia', DEU: 'Alemania',
  ITA: 'Italia', GBR: 'Reino Unido', NLD: 'Países Bajos', BEL: 'Bélgica',
  CHE: 'Suiza', AUT: 'Austria', POL: 'Polonia', SWE: 'Suecia',
  NOR: 'Noruega', DNK: 'Dinamarca', FIN: 'Finlandia', RUS: 'Rusia',
  CHN: 'China', JPN: 'Japón', KOR: 'Corea del Sur', IND: 'India',
  IDN: 'Indonesia', THA: 'Tailandia', VNM: 'Vietnam', MYS: 'Malasia',
  PHL: 'Filipinas', SGP: 'Singapur', AUS: 'Australia', NZL: 'Nueva Zelanda',
  ZAF: 'Sudáfrica', NGA: 'Nigeria', EGY: 'Egipto', KEN: 'Kenia',
  MAR: 'Marruecos', GHA: 'Ghana', SAU: 'Arabia Saudita', ARE: 'Emiratos',
  ISR: 'Israel', TUR: 'Turquía', IRN: 'Irán', PAK: 'Pakistán',
};

// ─── Country dropdown options (ISO 3) used in the client form ──────────────
export const COUNTRY_OPTIONS = [
  { code: 'ARG', name: 'Argentina' }, { code: 'AUS', name: 'Australia' },
  { code: 'AUT', name: 'Austria' }, { code: 'BEL', name: 'Bélgica' },
  { code: 'BOL', name: 'Bolivia' }, { code: 'BRA', name: 'Brasil' },
  { code: 'CAN', name: 'Canadá' }, { code: 'CHL', name: 'Chile' },
  { code: 'CHN', name: 'China' }, { code: 'COL', name: 'Colombia' },
  { code: 'CRI', name: 'Costa Rica' }, { code: 'CUB', name: 'Cuba' },
  { code: 'DEU', name: 'Alemania' }, { code: 'DNK', name: 'Dinamarca' },
  { code: 'DOM', name: 'República Dominicana' }, { code: 'ECU', name: 'Ecuador' },
  { code: 'EGY', name: 'Egipto' }, { code: 'ESP', name: 'España' },
  { code: 'FIN', name: 'Finlandia' }, { code: 'FRA', name: 'Francia' },
  { code: 'GBR', name: 'Reino Unido' }, { code: 'GHA', name: 'Ghana' },
  { code: 'GTM', name: 'Guatemala' }, { code: 'HND', name: 'Honduras' },
  { code: 'HTI', name: 'Haití' }, { code: 'IDN', name: 'Indonesia' },
  { code: 'IND', name: 'India' }, { code: 'IRN', name: 'Irán' },
  { code: 'ISR', name: 'Israel' }, { code: 'ITA', name: 'Italia' },
  { code: 'JAM', name: 'Jamaica' }, { code: 'JPN', name: 'Japón' },
  { code: 'KEN', name: 'Kenia' }, { code: 'KOR', name: 'Corea del Sur' },
  { code: 'MAR', name: 'Marruecos' }, { code: 'MEX', name: 'México' },
  { code: 'MYS', name: 'Malasia' }, { code: 'NGA', name: 'Nigeria' },
  { code: 'NIC', name: 'Nicaragua' }, { code: 'NLD', name: 'Países Bajos' },
  { code: 'NOR', name: 'Noruega' }, { code: 'NZL', name: 'Nueva Zelanda' },
  { code: 'PAK', name: 'Pakistán' }, { code: 'PAN', name: 'Panamá' },
  { code: 'PER', name: 'Perú' }, { code: 'PHL', name: 'Filipinas' },
  { code: 'POL', name: 'Polonia' }, { code: 'PRY', name: 'Paraguay' },
  { code: 'PRT', name: 'Portugal' }, { code: 'RUS', name: 'Rusia' },
  { code: 'SAU', name: 'Arabia Saudita' }, { code: 'SGP', name: 'Singapur' },
  { code: 'SLV', name: 'El Salvador' }, { code: 'SUR', name: 'Surinam' },
  { code: 'SWE', name: 'Suecia' }, { code: 'THA', name: 'Tailandia' },
  { code: 'TTO', name: 'Trinidad y Tobago' }, { code: 'TUR', name: 'Turquía' },
  { code: 'ARE', name: 'Emiratos Árabes' }, { code: 'URY', name: 'Uruguay' },
  { code: 'USA', name: 'Estados Unidos' }, { code: 'VEN', name: 'Venezuela' },
  { code: 'VNM', name: 'Vietnam' }, { code: 'ZAF', name: 'Sudáfrica' },
];

// Map ISO-3 to country name helper
export function getCountryName(iso3) {
  return ISO3_TO_NAME[iso3] || COUNTRY_OPTIONS.find(c => c.code === iso3)?.name || iso3;
}

// ─── Color interpolation (no d3 dependency) ─────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}
function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function interpolateColor(colorA, colorB, t) {
  const [r1, g1, b1] = hexToRgb(colorA);
  const [r2, g2, b2] = hexToRgb(colorB);
  return `rgb(${lerp(r1, r2, t)},${lerp(g1, g2, t)},${lerp(b1, b2, t)})`;
}

// World TopoJSON (Natural Earth 110m) — lightweight CDN URL
const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ISO numeric → ISO alpha-3 mapping (subset, extend as needed)
const NUMERIC_TO_ISO3 = {
  '004':'AFG','008':'ALB','012':'DZA','024':'AGO','032':'ARG','036':'AUS',
  '040':'AUT','050':'BGD','056':'BEL','068':'BOL','076':'BRA','100':'BGR',
  '116':'KHM','120':'CMR','124':'CAN','144':'LKA','152':'CHL','156':'CHN',
  '170':'COL','188':'CRI','191':'HRV','192':'CUB','196':'CYP','208':'DNK',
  '214':'DOM','218':'ECU','818':'EGY','222':'SLV','231':'ETH','246':'FIN',
  '250':'FRA','276':'DEU','288':'GHA','300':'GRC','320':'GTM','324':'GIN',
  '332':'HTI','340':'HND','348':'HUN','356':'IND','360':'IDN','364':'IRN',
  '368':'IRQ','372':'IRL','376':'ISR','380':'ITA','388':'JAM','392':'JPN',
  '400':'JOR','398':'KAZ','404':'KEN','410':'KOR','414':'KWT','422':'LBN',
  '484':'MEX','504':'MAR','516':'NAM','524':'NPL','528':'NLD','554':'NZL',
  '566':'NGA','578':'NOR','586':'PAK','591':'PAN','600':'PRY','604':'PER',
  '608':'PHL','616':'POL','620':'PRT','630':'PRI','634':'QAT','642':'ROU',
  '643':'RUS','682':'SAU','686':'SEN','694':'SLE','710':'ZAF','724':'ESP',
  '752':'SWE','756':'CHE','762':'TJK','764':'THA','780':'TTO','788':'TUN',
  '792':'TUR','800':'UGA','804':'UKR','784':'ARE','826':'GBR','840':'USA',
  '858':'URY','860':'UZB','862':'VEN','704':'VNM','887':'YEM','716':'ZWE',
  '218':'ECU','332':'HTI','740':'SUR','328':'GUY',
};

// ─── Main Widget Component ──────────────────────────────────────────────────
export default function SalesMapWidget({ salesByCountry = null }) {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: null });
  const [position, setPosition] = useState({ coordinates: [0, 20], zoom: 1 });

  // Mock data used when no real data is provided
  const MOCK_DATA = {
    MEX: { sales: 45000, cases: 320, label: 'México' },
    USA: { sales: 28500, cases: 180, label: 'Estados Unidos' },
    ECU: { sales: 12000, cases: 95, label: 'Ecuador' },
    COL: { sales: 8750, cases: 60, label: 'Colombia' },
    PER: { sales: 6200, cases: 44, label: 'Perú' },
    CHL: { sales: 4800, cases: 32, label: 'Chile' },
    DOM: { sales: 3200, cases: 24, label: 'Rep. Dominicana' },
    CAN: { sales: 2100, cases: 15, label: 'Canadá' },
    GTM: { sales: 1400, cases: 10, label: 'Guatemala' },
    CRI: { sales: 900, cases: 7, label: 'Costa Rica' },
  };

  const data = salesByCountry || MOCK_DATA;

  // Compute max for color scale
  const maxSales = useMemo(
    () => Math.max(...Object.values(data).map(d => d.sales), 1),
    [data]
  );

  // Color for a given country
  const getColor = useCallback((iso3) => {
    const entry = data[iso3];
    if (!entry || entry.sales <= 0) return '#16202e';
    const t = Math.pow(entry.sales / maxSales, 0.5); // sqrt for better contrast
    // Cyan gradient: #0d2137 → #00d4ff
    return interpolateColor('#0d2137', '#00d4ff', t);
  }, [data, maxSales]);

  const handleMouseEnter = useCallback((geo, evt) => {
    const iso3 = NUMERIC_TO_ISO3[geo.id];
    const entry = iso3 ? data[iso3] : null;
    if (!entry) return;
    setTooltip({
      visible: true,
      x: evt.clientX,
      y: evt.clientY,
      content: {
        name: entry.label || getCountryName(iso3),
        sales: entry.sales,
        cases: entry.cases,
        iso3,
      },
    });
  }, [data]);

  const handleMouseMove = useCallback((evt) => {
    if (tooltip.visible) {
      setTooltip(t => ({ ...t, x: evt.clientX, y: evt.clientY }));
    }
  }, [tooltip.visible]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(t => ({ ...t, visible: false }));
  }, []);

  // Top countries sorted by sales
  const topCountries = useMemo(
    () => Object.entries(data)
      .sort((a, b) => b[1].sales - a[1].sales)
      .slice(0, 6),
    [data]
  );

  const usingMock = !salesByCountry;

  return (
    <>
      {/* ── Tooltip ──────────────────────────────────────────────────────── */}
      {tooltip.visible && tooltip.content && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 14,
            top: tooltip.y - 10,
            zIndex: 9999,
            background: 'rgba(10,16,26,0.96)',
            border: '1px solid rgba(0,212,255,0.3)',
            backdropFilter: 'blur(12px)',
            borderRadius: '10px',
            padding: '10px 14px',
            pointerEvents: 'none',
            boxShadow: '0 0 20px rgba(0,212,255,0.15)',
            minWidth: '170px',
          }}
        >
          <div style={{ fontWeight: '700', color: '#fff', fontSize: '13px', marginBottom: '6px' }}>
            🌍 {tooltip.content.name}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--cyan-neon)', fontWeight: '700' }}>
            ${tooltip.content.sales.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px' }}>
            📦 {tooltip.content.cases.toLocaleString()} cajas vendidas
          </div>
        </div>
      )}

      {/* ── Widget Card ──────────────────────────────────────────────────── */}
      <div
        className="glass-panel"
        style={{
          padding: '20px',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '16px',
          background: 'rgba(13,21,37,0.6)',
          backdropFilter: 'blur(16px)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Glow accent */}
        <div style={{
          position: 'absolute', top: '-40px', right: '-40px',
          width: '200px', height: '200px',
          background: 'radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#fff', letterSpacing: '0.3px' }}>
              🌎 Ventas Globales por País
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
              Distribución geográfica de compras B2B · intensidad = volumen
            </p>
          </div>
          {usingMock && (
            <span style={{
              fontSize: '10px', padding: '3px 8px', borderRadius: '20px',
              background: 'rgba(255,165,0,0.1)', color: '#f59e0b',
              border: '1px solid rgba(245,158,11,0.3)', fontWeight: '600',
            }}>
              DEMO
            </span>
          )}
        </div>

        {/* Map */}
        <div
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ borderRadius: '10px', overflow: 'hidden', background: 'rgba(8,14,24,0.8)', cursor: 'grab' }}
        >
          <ComposableMap
            projection="geoNaturalEarth1"
            projectionConfig={{ scale: 155, center: [0, 15] }}
            style={{ width: '100%', height: 'auto' }}
            height={380}
          >
            <ZoomableGroup
              zoom={position.zoom}
              center={position.coordinates}
              onMoveEnd={setPosition}
              maxZoom={6}
            >
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const iso3 = NUMERIC_TO_ISO3[geo.id];
                    const entry = iso3 ? data[iso3] : null;
                    const fill = getColor(iso3);
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fill}
                        stroke={entry ? 'rgba(0,212,255,0.25)' : 'rgba(255,255,255,0.04)'}
                        strokeWidth={entry ? 0.6 : 0.3}
                        style={{
                          default: { outline: 'none', transition: 'fill 0.15s ease' },
                          hover: {
                            fill: entry ? interpolateColor('#00d4ff', '#ffffff', 0.25) : '#1e2d3d',
                            outline: 'none',
                            cursor: entry ? 'pointer' : 'default',
                          },
                          pressed: { outline: 'none' },
                        }}
                        onMouseEnter={entry ? (evt) => handleMouseEnter(geo, evt) : undefined}
                        onMouseLeave={entry ? handleMouseLeave : undefined}
                      />
                    );
                  })
                }
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>
        </div>

        {/* Legend + Top Countries */}
        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px', alignItems: 'end' }}>
          {/* Top countries list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
              Top Mercados
            </div>
            {topCountries.map(([iso3, d], i) => {
              const pct = (d.sales / maxSales) * 100;
              return (
                <div key={iso3} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', width: '14px', textAlign: 'right' }}>
                    {i + 1}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ fontSize: '11px', color: '#fff', fontWeight: '600' }}>
                        {d.label || getCountryName(iso3)}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--cyan-neon)', fontWeight: '700' }}>
                        ${d.sales.toLocaleString('en-US')}
                      </span>
                    </div>
                    <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px' }}>
                      <div style={{
                        height: '100%', width: `${pct}%`, borderRadius: '2px',
                        background: `linear-gradient(90deg, #0d2137, #00d4ff)`,
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Color scale legend */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>
              Mayor
            </span>
            <div style={{
              width: '12px', height: '80px', borderRadius: '6px',
              background: 'linear-gradient(to bottom, #00d4ff, #0d2137)',
              border: '1px solid rgba(255,255,255,0.08)',
            }} />
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>
              Menor
            </span>
          </div>
        </div>

        {/* Zoom hint */}
        <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '10px', color: 'var(--text-muted)' }}>
          🖱️ Scroll para zoom · Arrastra para navegar · Hover sobre un país activo para ver detalles
        </div>
      </div>
    </>
  );
}
