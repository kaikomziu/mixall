const AGE_CATEGORIES = new Set(['inm', 'sexual', 'other']);
const BIRTH_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const AGE_TIME_ZONE = 'Asia/Tokyo';

function parseBirthDate(value) {
  const match = String(value || '').match(BIRTH_DATE_PATTERN);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

function datePartsInTokyo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:AGE_TIME_ZONE, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  return { year:values.year, month:values.month, day:values.day };
}

function getAgeFromBirthDate(value, now = new Date()) {
  const birth = parseBirthDate(value);
  if (!birth) return null;
  const today = datePartsInTokyo(now);
  let age = today.year - birth.year;
  if (today.month < birth.month || (today.month === birth.month && today.day < birth.day)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function isValidBirthDate(value, now = new Date()) {
  return getAgeFromBirthDate(value, now) !== null;
}

function isValidAge(value) {
  if (value === null || value === undefined || String(value).trim() === '') return false;
  const age = Number(value);
  return Number.isInteger(age) && age >= 0 && age <= 120;
}

function normalizedCategories(review) {
  const source = Array.isArray(review?.categories) ? review.categories : [];
  return new Set(source.filter((category) => AGE_CATEGORIES.has(category)));
}

function canViewAgeReviewed(item, age) {
  if (!isValidAge(age)) return false;
  if (age >= 13) return true;
  const review = item?.ageReview;
  if (!review || review.status !== 'reviewed') return false;
  const categories = normalizedCategories(review);
  if (categories.has('sexual') || categories.has('other')) return false;
  if (age < 10 && categories.has('inm')) return false;
  return true;
}

function visibleComments(comments, age) {
  return (Array.isArray(comments) ? comments : []).filter((comment) => canViewAgeReviewed(comment, age));
}

module.exports = { AGE_CATEGORIES, parseBirthDate, getAgeFromBirthDate, isValidBirthDate, isValidAge, canViewAgeReviewed, visibleComments };
