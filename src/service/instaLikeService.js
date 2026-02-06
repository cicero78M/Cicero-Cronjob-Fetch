import * as instaLikeModel from '../model/instaLikeModel.js';

export const findByShortcode = async (shortcode) => {
  return await instaLikeModel.getLikesByShortcode(shortcode);
};
