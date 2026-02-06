import * as instaProfileModel from '../model/instaProfileModel.js';

export const upsertProfile = async (data) => {
  return instaProfileModel.upsertInstaProfile(data);
};

export const findByUsername = async (username) => {
  return instaProfileModel.findByUsername(username);
};
