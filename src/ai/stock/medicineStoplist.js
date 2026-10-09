// Words that are never treated as a medicine BRAND name, even if the NHS list happens to contain one:
// ordinary English and the words people use about stock. Without this a brand called "The" or "Zinc"
// would rewrite everyday sentences. Used when the list is built and again when names are matched.
export const NEVER_BRAND = new Set(`
a an the and or of to in on at by for with from into onto about as is are was were be been it its this that these those
i me my we our you your he she they them their his her one two three four five six seven eight nine ten first
please take took taken used use using remove removed removing record recorded log add put get give got have has had
need needs want wants stock item items product products box boxes pack packs packet bag bags tube tubes pot pots
cup cups bottle bottles vial vials ampoule ampoules ampule ampules tablet tablets capsule capsules dose doses unit units
room rooms store stores cupboard cupboards fridge fridges shelf shelves kit kits trolley trolleys bin bins
blue green orange white red yellow pink black purple grey clear
gloves glove needle needles syringe syringes swab swabs gauze tape plaster plasters bandage bandages dressing dressings
wipe wipes mask masks apron aprons towel towels paper tissue soap sanitiser water salt sugar milk oil gel cream spray
lancet lancets catheter catheters speculum specula thermometer thermometers tourniquet scissors forceps cotton wool
sharps urine blood sample samples test tests label labels clean cleaning sterile steriles pen pens strip strips
batch lot expiry expires low high day days night new old out in off up down more less some any all each every
patient patients nurse nurses doctor doctors surgery practice team staff
zinc odour muse oxy vital pure free active plus extra mini max pro
nitrile latex vinyl polythene hypoallergenic disposable adhesive absorbent sterile non-sterile powder-free
`.split(/\s+/).filter(Boolean));
