/**
 * Indian container ports, with the figures that were found in sources and where each came from.
 *
 * Read this before trusting a number:
 *  - Every figure carries the source it was read from and a `grade`:
 *      'ministry'  from the Ministry of Ports, Shipping and Waterways or the port itself
 *      'secondary' from Wikipedia, a trade publication, a company release or a guide
 *      'unverified' not found in a source; shown only so the gap is visible, never used in a calculation
 *  - Periods differ (financial year, calendar year, partial year). They are shown as written and must not
 *    be compared as if they were the same year.
 *  - Coordinates are approximate (two decimals), for placing markers on a country-scale map.
 *  - Nothing here is the real layout of any yard. Per-port yards in the simulator are illustrative presets.
 */
export type Grade = 'ministry' | 'secondary' | 'unverified'

export type Source = { label: string; url: string }

export type Figure = {
  teu: number
  /** the period exactly as the source states it */
  period: string
  grade: Grade
  source: Source
  note?: string
}

export type PortFact = {
  id: string
  name: string
  short: string
  state: string
  /** approximate, for a country-scale map */
  lat: number
  lon: number
  terminals?: string
  throughput?: Figure
  /** a stated annual container capacity, in TEU */
  capacityTeu?: { value: number; grade: Grade; source: Source }
  notes?: string
}

const wiki = (title: string): Source => ({ label: `Wikipedia: ${title.replace(/_/g, ' ')}`, url: `https://en.wikipedia.org/wiki/${title}` })

export const PORTS: PortFact[] = [
  {
    id: 'voc',
    name: 'V.O. Chidambaranar Port, Thoothukudi',
    short: 'VOC (Tuticorin)',
    state: 'Tamil Nadu',
    lat: 8.76,
    lon: 78.14,
    terminals: 'PSA SICAL and DBGT (two private container terminals); a third terminal at Berth 9 was planned',
    throughput: {
      teu: 734_000,
      period: 'FY 2022-23 (about)',
      grade: 'secondary',
      source: wiki('V._O._Chidambaranar_Port'),
      note: 'A later report gives 5.62 lakh TEU up to 19 Dec 2024 (a partial year).',
    },
    capacityTeu: {
      value: 1_170_000,
      grade: 'secondary',
      source: { label: 'Port Technology: VOC Port inks concession for a new terminal', url: 'https://www.porttechnology.org/news/voc-port-inks-concession-for-new-600000-teu-container-terminal-in-india/' },
    },
    notes: 'The port this project is built around. Its yard equipment and block layout were not found in a source.',
  },
  {
    id: 'jnpa',
    name: 'Jawaharlal Nehru Port (Nhava Sheva)',
    short: 'JNPA',
    state: 'Maharashtra',
    lat: 18.95,
    lon: 72.95,
    throughput: {
      teu: 5_835_650,
      period: 'FY 2023-24',
      grade: 'secondary',
      source: wiki('Jawaharlal_Nehru_Port'),
      note: 'The Ministry reports it handled about 54% of all major-port TEU.',
    },
  },
  {
    id: 'chennai',
    name: 'Chennai Port',
    short: 'Chennai',
    state: 'Tamil Nadu',
    lat: 13.1,
    lon: 80.3,
    throughput: {
      teu: 1_590_000,
      period: 'FY 2023-24 (about)',
      grade: 'secondary',
      source: { label: 'Ship4wd: major container ports in India', url: 'https://ship4wd.com/logistics-shipping/container-ports-in-india' },
      note: 'A guide, not the port; treat as approximate.',
    },
  },
  {
    id: 'kamarajar',
    name: 'Kamarajar Port (Ennore)',
    short: 'Kamarajar',
    state: 'Tamil Nadu',
    lat: 13.27,
    lon: 80.34,
    throughput: { teu: 671_393, period: 'FY 2023-24', grade: 'secondary', source: wiki('Kamarajar_Port') },
  },
  {
    id: 'cochin',
    name: 'Cochin Port (Vallarpadam terminal)',
    short: 'Kochi',
    state: 'Kerala',
    lat: 9.97,
    lon: 76.27,
    throughput: {
      teu: 840_564,
      period: 'calendar 2024',
      grade: 'unverified',
      source: { label: 'Reported in search results; original not opened', url: 'https://ship4wd.com/logistics-shipping/container-ports-in-india' },
      note: 'Calendar year, so not comparable with the financial-year figures above.',
    },
  },
  {
    id: 'vizag',
    name: 'Visakhapatnam Port',
    short: 'Visakhapatnam',
    state: 'Andhra Pradesh',
    lat: 17.69,
    lon: 83.29,
    throughput: {
      teu: 512_000,
      period: 'calendar 2022 (about)',
      grade: 'unverified',
      source: { label: 'Reported in search results; original not opened', url: 'https://ship4wd.com/logistics-shipping/container-ports-in-india' },
      note: 'An older year than the rest.',
    },
  },
  {
    id: 'kolkata',
    name: 'Syama Prasad Mookerjee Port, Kolkata',
    short: 'Kolkata',
    state: 'West Bengal',
    lat: 22.55,
    lon: 88.31,
    throughput: {
      teu: 960_549,
      period: 'FY 2025-26',
      grade: 'secondary',
      source: wiki('Port_of_Kolkata'),
      note: 'A newer year than the rest.',
    },
  },
  {
    id: 'mundra',
    name: 'Mundra Port',
    short: 'Mundra',
    state: 'Gujarat',
    lat: 22.74,
    lon: 69.7,
    terminals: 'Several terminals; DP World MICT alone handled 1.42 M TEU in 2024',
    throughput: {
      teu: 8_217_055,
      period: 'calendar 2024 (whole port)',
      grade: 'secondary',
      source: { label: "Lloyd's List: top 100 ports, Mundra", url: 'https://www.lloydslist.com/LL1154069/25-Mundra-India' },
    },
  },
]

/** Benchmarks that are about the system, not one port. */
export const BENCHMARKS: { label: string; value: string; grade: Grade; source: Source }[] = [
  {
    label: 'Export container dwell at Indian ports (median)',
    value: 'just over 4 days in Q1 2024, up from 3.5 days a year earlier',
    grade: 'secondary',
    source: { label: 'BusinessWorld, citing S&P Global', url: 'https://businessworld.in/article/volume-productivity-improved-at-most-indian-ports-in-q1-2024-sp-520277' },
  },
  {
    label: 'Import container dwell, larger Indian ports',
    value: 'down 22% year on year in Q1 2024',
    grade: 'secondary',
    source: { label: 'BusinessWorld, citing S&P Global', url: 'https://businessworld.in/article/volume-productivity-improved-at-most-indian-ports-in-q1-2024-sp-520277' },
  },
  {
    label: 'Historic dwell vs an efficient-port benchmark',
    value: '3 to 6 days for most inbound shipments, against 24 to 48 hours at ports such as Singapore or Rotterdam',
    grade: 'secondary',
    source: { label: 'Allcargo Terminals', url: 'https://www.allcargoterminals.com/?p=3427' },
  },
  {
    label: 'JNPA import-cycle dwell, October 2024',
    value: '20.3 hours (NICDC counts hours and includes free time; not comparable with the day figures)',
    grade: 'ministry',
    source: { label: 'NICDC Logistics Data Bank report, Oct 2024', url: 'https://www.jnport.gov.in/uploads/pdf/ia_report/107/LDB_Analytics_Report-Oct24.pdf' },
  },
]

/**
 * What a terminal charges a customer to move a box inside the yard. It is a price, not the terminal's cost,
 * so it is only a proxy for what one avoided move is worth. Edit it in the calculator.
 */
export const SHIFTING_TARIFF = {
  rupeesPer20ft: 1278,
  label: 'Internal shifting within the terminal, per 20-ft box',
  detail: 'Tuticorin container terminal tariff effective 10 June 2026. Restowing bay to bay is listed at about 3,323 per 20-ft box.',
  grade: 'secondary' as Grade,
  source: {
    label: 'Terminal tariff (EXIM), Tuticorin, effective 10.06.2026',
    url: 'https://www.jmbaxi.com/pdf/tuticorin/PNL_Terminal%20Tariff_TICT_%20EXIM_10.06.2026.pdf',
  },
}

export const GRADE_LABEL: Record<Grade, string> = {
  ministry: 'official',
  secondary: 'secondary source',
  unverified: 'unverified',
}
