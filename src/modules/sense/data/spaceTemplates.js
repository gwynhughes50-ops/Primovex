export const SPACE_TYPES = [
  { id: 'consulting-room', label: 'Consulting room', group: 'Clinical', capabilities: ['cleaning','issues','equipment','checks','ai'] },
  { id: 'treatment-room', label: 'Treatment room', group: 'Clinical', capabilities: ['stock','cleaning','issues','equipment','checks','ai'] },
  { id: 'minor-ops-room', label: 'Minor ops room', group: 'Clinical', capabilities: ['stock','cleaning','issues','equipment','checks','audits','ai'] },
  { id: 'research-room', label: 'Research room', group: 'Clinical', capabilities: ['stock','cleaning','issues','equipment','documents','ai'] },
  { id: 'sluice', label: 'Sluice', group: 'Clinical support', capabilities: ['cleaning','issues','checks','audits','ai'] },
  { id: 'store-room', label: 'Store room', group: 'Storage', capabilities: ['stock','cleaning','issues','checks','ai'] },
  { id: 'filing-room', label: 'Filing room', group: 'Storage', capabilities: ['cleaning','issues','documents','security','ai'] },
  { id: 'admin-office', label: 'Admin room', group: 'Administration', capabilities: ['cleaning','issues','equipment','documents','ai'] },
  { id: 'reception', label: 'Reception', group: 'Public', capabilities: ['cleaning','issues','equipment','checks','ai'] },
  { id: 'education-room', label: 'Education room', group: 'Administration', capabilities: ['cleaning','issues','equipment','bookings','ai'] },
  { id: 'staff-room', label: 'Staff room', group: 'Staff', capabilities: ['cleaning','issues','equipment','checks','ai'] },
  { id: 'computer-room', label: 'Computer room', group: 'IT', capabilities: ['cleaning','issues','equipment','maintenance','ai'] },
  { id: 'it-admin-room', label: 'IT admin room', group: 'IT', capabilities: ['cleaning','issues','equipment','maintenance','documents','ai'] },
  { id: 'conference-room', label: 'Conference room', group: 'Administration', capabilities: ['cleaning','issues','equipment','bookings','ai'] },
  { id: 'toilet', label: 'Toilet', group: 'Public', capabilities: ['cleaning','issues','checks','audits'] },
  { id: 'baby-changing', label: 'Baby changing', group: 'Public', capabilities: ['cleaning','issues','stock','checks','audits'] },
  { id: 'plant-room', label: 'Plant room', group: 'Facilities', capabilities: ['issues','equipment','maintenance','checks','documents','ai'] },
  { id: 'cleaners-room', label: 'Cleaners room', group: 'Facilities', capabilities: ['stock','cleaning','issues','equipment','checks'] },
  { id: 'kitchen', label: 'Kitchen', group: 'Staff', capabilities: ['cleaning','issues','equipment','checks','audits'] },
  { id: 'stairwell', label: 'Stairwell', group: 'Circulation', capabilities: ['cleaning','issues','checks','audits'] },
  { id: 'corridor', label: 'Corridor', group: 'Circulation', capabilities: ['cleaning','issues','checks','audits'] },
  { id: 'waiting-area', label: 'Waiting area', group: 'Public', capabilities: ['cleaning','issues','equipment','checks','ai'] },
  { id: 'other', label: 'Other / custom', group: 'Other', capabilities: ['cleaning','issues','ai'] },
];

export const DEFAULT_SITES = [{ id: 'SITE-MAIN', name: 'Main Surgery', status: 'active' }];
export const DEFAULT_FLOORS = [
  { id: 'FLOOR-GROUND', siteId: 'SITE-MAIN', name: 'Ground Floor', order: 0 },
  { id: 'FLOOR-FIRST', siteId: 'SITE-MAIN', name: 'First Floor', order: 1 },
  { id: 'FLOOR-SECOND', siteId: 'SITE-MAIN', name: 'Second Floor', order: 2 },
];
export const DEFAULT_ZONES = [
  { id: 'ZONE-CLINICAL', siteId: 'SITE-MAIN', name: 'Clinical' },
  { id: 'ZONE-PUBLIC', siteId: 'SITE-MAIN', name: 'Public / front of house' },
  { id: 'ZONE-ADMIN', siteId: 'SITE-MAIN', name: 'Administration' },
  { id: 'ZONE-STAFF', siteId: 'SITE-MAIN', name: 'Staff' },
  { id: 'ZONE-FACILITIES', siteId: 'SITE-MAIN', name: 'Facilities' },
  { id: 'ZONE-STORES', siteId: 'SITE-MAIN', name: 'Stores' },
];

export function getSpaceTemplate(typeId) {
  return SPACE_TYPES.find((type) => type.id === typeId) || SPACE_TYPES[SPACE_TYPES.length - 1];
}
