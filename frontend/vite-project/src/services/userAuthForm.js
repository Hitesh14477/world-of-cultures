export function passwordConfirmationMatches(password, confirmation) {
  return password === confirmation
}

export function createUserAuthPayload({ registering, username, email, password }) {
  return registering ? { username, email, password } : { email, password }
}
