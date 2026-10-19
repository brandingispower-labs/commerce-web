// lib/medusa/menus.ts — Shopify 의 CMS 기능(메뉴 · 페이지)을 대신하는 정적 상수.
// Medusa 에는 메뉴 · 페이지 개념이 없다. 스토어프런트가 소유하는 값으로 두고
// 카테고리 경로만 commerce-api 의 시드 카테고리(Shirts · Sweatshirts · Pants · Merch)와 맞춘다.

import type { Menu, Page } from "./types";

// 정적 페이지의 갱신 시각. sitemap 의 lastModified 가 빌드마다 바뀌지 않도록 상수로 둔다.
const PAGE_UPDATED_AT = "2026-09-18T00:00:00.000Z";

export const HEADER_MENU_HANDLE = "next-js-frontend-header-menu";
export const FOOTER_MENU_HANDLE = "next-js-frontend-footer-menu";

const headerMenu: Menu[] = [
  { title: "All", path: "/search" },
  { title: "Shirts", path: "/search/shirts" },
  { title: "Sweatshirts", path: "/search/sweatshirts" },
  { title: "Pants", path: "/search/pants" },
  { title: "Merch", path: "/search/merch" },
];

const footerMenu: Menu[] = [
  { title: "Home", path: "/" },
  { title: "All products", path: "/search" },
  { title: "About", path: "/about" },
  { title: "Terms & Conditions", path: "/terms-conditions" },
];

export const MENUS: Record<string, Menu[]> = {
  [HEADER_MENU_HANDLE]: headerMenu,
  [FOOTER_MENU_HANDLE]: footerMenu,
};

export const PAGES: Page[] = [
  {
    id: "page-about",
    title: "About",
    handle: "about",
    body: "<p>This storefront runs on Next.js and reads its catalog from commerce-api (Medusa v2).</p>",
    bodySummary:
      "This storefront runs on Next.js and reads its catalog from commerce-api.",
    seo: {
      title: "About",
      description: "About this store",
    },
    createdAt: PAGE_UPDATED_AT,
    updatedAt: PAGE_UPDATED_AT,
  },
  {
    // lib/medusa/index.ts 의 CHECKOUT_PATH 가 가리키는 자리다.
    // Medusa 에는 호스팅 결제 페이지가 없고 결제 연동은 이 과정의 범위 밖이므로 안내 문구만 둔다.
    id: "page-checkout",
    title: "Checkout",
    handle: "checkout",
    body: "<p>Checkout is out of scope for this course. The cart is stored in commerce-api and the order is never placed.</p>",
    bodySummary: "Checkout is out of scope for this course.",
    seo: {
      title: "Checkout",
      description: "Checkout is out of scope for this course",
    },
    createdAt: PAGE_UPDATED_AT,
    updatedAt: PAGE_UPDATED_AT,
  },
  {
    id: "page-terms-conditions",
    title: "Terms & Conditions",
    handle: "terms-conditions",
    body: "<p>This is a course demo store. No real order is placed and no payment is taken.</p>",
    bodySummary: "This is a course demo store. No real order is placed.",
    seo: {
      title: "Terms & Conditions",
      description: "Terms and conditions of this demo store",
    },
    createdAt: PAGE_UPDATED_AT,
    updatedAt: PAGE_UPDATED_AT,
  },
];
