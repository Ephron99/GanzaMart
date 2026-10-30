// Newsletter + contact form rules. Both are public write endpoints, so both are
// rate limited at the route level (spec §9) and normalised here before storage.
import * as contentModel from '../models/contentModel.js';

export async function subscribeToNewsletter(rawEmail) {
  // Lower-casing is what makes the UNIQUE index actually catch duplicates:
  // "Alice@Example.com" and "alice@example.com" are one subscriber, not two.
  const email = String(rawEmail).trim().toLowerCase();
  const { inserted } = await contentModel.subscribe(email);

  return inserted
    ? { subscribed: true, alreadySubscribed: false, message: 'Thank you! You are on the list.' }
    // Deliberately not an error: re-subscribing is a normal thing a visitor does.
    : { subscribed: true, alreadySubscribed: true, message: 'You are already subscribed — thank you!' };
}

export async function submitContactMessage({ name, email, phone, subject, message }) {
  const id = await contentModel.insertContactMessage({
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    phone: phone ? String(phone).trim() : null,
    subject: String(subject).trim(),
    message: String(message).trim(),
  });

  // The visitor gets a reference number: proof the message was stored, without
  // exposing anything about other people's messages.
  return { id, ticket: `GM-${String(id).padStart(6, '0')}`, message: 'Message received. We reply within one working day.' };
}
