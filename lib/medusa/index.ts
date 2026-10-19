// lib/medusa/index.ts — 스토어프런트의 provider(데이터 출처).
// lib/shopify/index.ts 가 내보내던 함수와 이름 · 인자 · 반환 타입을 맞춰 두어 화면 코드를 고치지 않는다.
// 데이터 출처만 Shopify Storefront GraphQL 에서 commerce-api(Medusa v2) Store API 로 바뀐다.

import Medusa from "@medusajs/js-sdk";
import type { HttpTypes } from "@medusajs/types";
import { HIDDEN_PRODUCT_TAG, TAGS } from "lib/constants";
import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
  revalidateTag,
} from "next/cache";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { MENUS, PAGES } from "./menus";
import type {
  Cart,
  CartItem,
  Collection,
  Image,
  MedusaCart,
  MedusaCategory,
  MedusaLineItem,
  MedusaProduct,
  MedusaVariant,
  Menu,
  Money,
  Page,
  Product,
  ProductVariant,
} from "./types";

const backendUrl = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";
const publishableKey = process.env.MEDUSA_PUBLISHABLE_KEY || "";

// js-sdk 인스턴스 하나를 모듈 수준에서 만든다.
// publishableKey 는 /store/* 모든 요청의 x-publishable-api-key 헤더로 들어간다.
// 이 헤더가 없으면 서버가 HTTP 400 으로 거절한다(로컬에서 확인).
// 이름에 NEXT_PUBLIC_ 을 쓰지 않는다: 그 접두사를 쓰면 값이 빌드 산출물에 박혀
// 환경마다 이미지가 달라지고, 같은 digest 를 Dev 에서 Prod 로 승격할 수 없다.
// 배포 매니페스트도 같은 이름(MEDUSA_PUBLISHABLE_KEY)으로 주입한다.
const medusa = new Medusa({
  baseUrl: backendUrl,
  publishableKey,
  debug: process.env.NODE_ENV === "development",
});

// 가격은 계산값이라 기본 응답에 없다. region_id 와 함께 이 필드를 요청해야 variants[].calculated_price 가 온다.
const PRODUCT_FIELDS =
  "*variants.calculated_price,+variants.inventory_quantity";
// 시드 카탈로그는 상품 4개다. 과정 범위에서는 한 번에 다 읽고 화면에서 자른다.
const PRODUCT_PAGE_SIZE = 100;
// Medusa 는 이미지 치수를 저장하지 않는다. next/image 의 width · height 자리에 쓸 고정값.
const IMAGE_SIZE = 1000;
// Medusa 에는 호스팅 결제 페이지가 없다. checkoutUrl 자리에는 우리 경로를 넣는다(APP/02 범위 밖).
const CHECKOUT_PATH = "/checkout";
// Shopify 템플릿이 홈 화면에서 쓰는 두 컬렉션 handle. Medusa 에는 대응이 없어 전체 상품으로 대신한다.
// 백엔드에 닿지 못한 경우(이미지 빌드 시점 · 백엔드 재기동 중)와 백엔드가 준 오류를 가른다.
// 연결 자체가 안 된 것이면 화면을 비워 두고 넘어가고, 4xx · 5xx 응답은 그대로 던져 원인을 감추지 않는다.
const UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ECONNRESET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function isUnreachable(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && UNREACHABLE_CODES.has(code)) return true;
    const errors = (current as { errors?: unknown[] }).errors;
    if (Array.isArray(errors) && errors.some((e) => isUnreachable(e)))
      return true;
    const message = (current as { message?: unknown }).message;
    if (typeof message === "string" && message.includes("fetch failed"))
      return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

// 읽기 함수를 감싼다. 닿지 못하면 fallback 을 돌려주고 한 줄을 남긴다(로그 형식은 commerce-api 와 같은 JSON).
// 반드시 "use cache" 경계 **밖**에서 부른다 — 안에서 fallback 을 돌려주면 일시적인 연결 실패가
// cacheLife("days") 짜리 성공 결과로 캐시에 남는다. 캐시되는 안쪽 함수(cached*)는 성공만 돌려주고 실패는 던진다.
// (Next.js 는 던져진 결과를 캐시에 넣지 않는다.)
async function whenReachable<T>(
  source: string,
  fallback: T,
  load: () => Promise<T>,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (!isUnreachable(error) && !(await backendUnreachable())) throw error;
    console.log(
      JSON.stringify({
        level: "warn",
        message: "commerce-api unreachable — rendering without data",
        source,
        backend: process.env.MEDUSA_BACKEND_URL,
      }),
    );
    return fallback;
  }
}

// production 빌드에서는 "use cache" 경계를 넘어온 오류의 내용이 지워진다(digest 만 남는다 — Next.js 의 설계).
// 그래서 경계 밖에서는 오류 객체만으로 연결 실패였는지 알 수 없고, 실패한 경우에 한해 /health 를 한 번 직접 불러 가른다.
// 응답이 오면(상태 코드와 무관) 연결은 되는 것이므로 원래 오류를 그대로 던진다 — 4xx · 5xx 를 빈 화면으로 감추지 않는다.
async function backendUnreachable(): Promise<boolean> {
  try {
    await fetch(`${process.env.MEDUSA_BACKEND_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    return false;
  } catch (error) {
    if (isUnreachable(error)) return true;
    if (error instanceof Error && error.name === "TimeoutError") return true;
    throw error;
  }
}

const HOMEPAGE_COLLECTIONS = [
  "hidden-homepage-featured-items",
  "hidden-homepage-carousel",
];

type ExtractQuery = Record<string, unknown>;

// lib/shopify 의 shopifyFetch 자리. js-sdk 에 메서드가 없는 엔드포인트(예: commerce-api 의 /store/custom)를
// 부를 때 쓰는 저수준 HTTP 호출 함수이며, 아래 함수들은 store.* 메서드를 쓰므로 이 함수를 거치지 않는다.
export async function medusaFetch<T>({
  path,
  query,
}: {
  path: string;
  query?: ExtractQuery;
}): Promise<{ status: number; body: T }> {
  try {
    const body = await medusa.client.fetch<T>(path, { query });
    return { status: 200, body };
  } catch (e) {
    const status =
      typeof e === "object" && e !== null && "status" in e
        ? Number((e as { status?: number }).status) || 500
        : 500;
    throw {
      cause: e instanceof Error ? e.message : "unknown",
      status,
      path,
    };
  }
}

async function getRegionId(): Promise<string | undefined> {
  // 시드는 지역(region)을 "Europe" 하나만 만든다. 스토어프런트에 지역 선택 화면이 없으므로
  // 목록의 첫 번째를 기본 지역으로 쓴다. 지역이 늘어나면 선택 UI 를 먼저 만들어야 한다.
  const { regions } = await medusa.store.region.list({ limit: 1 });
  return regions[0]?.id;
}

function toMoney(
  amount: number | null | undefined,
  currencyCode: string | null | undefined,
): Money {
  return {
    amount: typeof amount === "number" ? amount.toString() : "0",
    // Medusa 는 통화를 소문자("eur")로 돌려주고 Intl.NumberFormat 은 ISO 대문자를 요구한다.
    currencyCode: (currencyCode || "usd").toUpperCase(),
  };
}

function toImage(url: string, altText: string): Image {
  return { url, altText, width: IMAGE_SIZE, height: IMAGE_SIZE };
}

function isVariantAvailable(variant: MedusaVariant): boolean {
  if (variant.manage_inventory === false) return true;
  if (variant.allow_backorder === true) return true;
  // 재고 수량은 fields 에 +variants.inventory_quantity 를 넣었을 때만 온다.
  // 값이 아예 없으면 "모른다" 이지 "없다" 가 아니므로 구매를 막지 않는다(최종 판정은 백엔드가 한다).
  if (variant.inventory_quantity == null) return true;
  return variant.inventory_quantity > 0;
}

function reshapeVariant(
  product: MedusaProduct,
  variant: MedusaVariant,
): ProductVariant {
  const selectedOptions = (variant.options ?? []).map((optionValue) => ({
    // 옵션 이름은 값에 붙어 오는 option.title 을 먼저 보고, 없으면 상품의 옵션 목록에서 id 로 찾는다.
    name:
      optionValue.option?.title ??
      (product.options ?? []).find((o) => o.id === optionValue.option_id)
        ?.title ??
      "",
    value: optionValue.value,
  }));

  return {
    id: variant.id,
    title: variant.title ?? "",
    availableForSale: isVariantAvailable(variant),
    selectedOptions,
    price: toMoney(
      variant.calculated_price?.calculated_amount,
      variant.calculated_price?.currency_code,
    ),
  };
}

function reshapeProduct(input: unknown): Product {
  const product = input as MedusaProduct;
  const variants = (product.variants ?? []).map((variant) =>
    reshapeVariant(product, variant),
  );
  const amounts = variants
    .map((variant) => Number(variant.price.amount))
    .filter((amount) => Number.isFinite(amount));
  const currencyCode = variants[0]?.price.currencyCode ?? "USD";
  const images = (product.images ?? []).map((image, index) =>
    toImage(image.url, `${product.title} - ${index + 1}`),
  );
  // thumbnail 이 비어 있으면 첫 이미지 URL 로 대신한다(Medusa 가 자동으로 채워 주는지는 확인하지 않았다).
  const featuredUrl = product.thumbnail ?? product.images?.[0]?.url ?? "";
  const description = product.description ?? "";

  return {
    id: product.id,
    handle: product.handle,
    availableForSale: variants.some((variant) => variant.availableForSale),
    title: product.title,
    description,
    options: (product.options ?? []).map((option) => ({
      id: option.id,
      name: option.title,
      values: (option.values ?? []).map((value) => value.value),
    })),
    priceRange: {
      minVariantPrice: toMoney(
        amounts.length ? Math.min(...amounts) : 0,
        currencyCode,
      ),
      maxVariantPrice: toMoney(
        amounts.length ? Math.max(...amounts) : 0,
        currencyCode,
      ),
    },
    variants,
    featuredImage: toImage(featuredUrl, product.title),
    images,
    seo: { title: product.title, description },
    // Medusa 에는 Shopify 의 hidden 태그 관례가 없다. 응답에 태그가 있으면 옮기고 없으면 빈 배열이다.
    tags: (product.tags ?? []).map((tag) => tag.value ?? ""),
    updatedAt:
      product.updated_at ?? product.created_at ?? new Date(0).toISOString(),
  };
}

function reshapeProducts(input: unknown[]): Product[] {
  return input
    .map((product) => reshapeProduct(product))
    .filter((product) => !product.tags.includes(HIDDEN_PRODUCT_TAG));
}

function reshapeCollection(input: unknown): Collection {
  const category = input as MedusaCategory;
  const description = category.description ?? `${category.name} products`;

  return {
    handle: category.handle,
    title: category.name,
    description,
    seo: { title: category.name, description },
    updatedAt:
      category.updated_at ?? category.created_at ?? new Date(0).toISOString(),
    path: `/search/${category.handle}`,
  };
}

function reshapeCartItem(item: MedusaLineItem, currencyCode: string): CartItem {
  const total =
    typeof item.total === "number"
      ? item.total
      : (item.unit_price ?? 0) * item.quantity;
  const fromValues = Object.entries(item.variant_option_values ?? {}).map(
    ([name, value]) => ({ name, value: String(value) }),
  );
  const fromVariant = (item.variant?.options ?? []).map((optionValue) => ({
    name: optionValue.option?.title ?? "",
    value: optionValue.value,
  }));
  const title = item.variant_title ?? item.title ?? "";
  const productTitle = item.product_title ?? item.title ?? "";

  return {
    id: item.id,
    quantity: item.quantity,
    cost: { totalAmount: toMoney(total, currencyCode) },
    merchandise: {
      // 화면이 말하는 merchandise 는 Medusa 의 variant 다.
      id: item.variant_id ?? "",
      title,
      selectedOptions: fromValues.length ? fromValues : fromVariant,
      product: {
        id: item.product_id ?? "",
        handle: item.product_handle ?? "",
        title: productTitle,
        featuredImage: toImage(item.thumbnail ?? "", productTitle),
      },
    },
  };
}

function reshapeCart(input: unknown): Cart {
  const cart = input as MedusaCart;
  const lines = (cart.items ?? []).map((item) =>
    reshapeCartItem(item, cart.currency_code),
  );

  return {
    id: cart.id,
    // Medusa 에는 호스팅 결제 URL 이 없다. 결제 화면은 이 과정의 범위 밖이다.
    checkoutUrl: CHECKOUT_PATH,
    cost: {
      subtotalAmount: toMoney(cart.subtotal, cart.currency_code),
      totalAmount: toMoney(cart.total, cart.currency_code),
      totalTaxAmount: toMoney(cart.tax_total, cart.currency_code),
    },
    lines,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

function orderOf(sortKey?: string, reverse?: boolean): string | undefined {
  // Medusa 는 저장된 컬럼만 정렬한다. 가격은 요청 시점에 계산되는 값이라 서버가 정렬하지 못한다.
  if (sortKey === "CREATED_AT") return reverse ? "-created_at" : "created_at";
  // Shopify 의 BEST_SELLING 에 대응하는 판매량 지표가 Store API 에 없다 → 최신순으로 대신한다.
  if (sortKey === "BEST_SELLING") return "-created_at";
  return undefined;
}

function sortByPriceIfNeeded(
  products: Product[],
  sortKey?: string,
  reverse?: boolean,
): Product[] {
  if (sortKey !== "PRICE") return products;

  return [...products].sort((a, b) => {
    const left = Number(a.priceRange.minVariantPrice.amount);
    const right = Number(b.priceRange.minVariantPrice.amount);
    return reverse ? right - left : left - right;
  });
}

async function listProducts(
  extra: HttpTypes.StoreProductListParams,
  sortKey?: string,
  reverse?: boolean,
): Promise<Product[]> {
  const regionId = await getRegionId();
  const params: HttpTypes.StoreProductListParams = {
    limit: PRODUCT_PAGE_SIZE,
    fields: PRODUCT_FIELDS,
    ...extra,
  };
  if (regionId) params.region_id = regionId;
  const order = orderOf(sortKey, reverse);
  if (order) params.order = order;

  const { products } = await medusa.store.product.list(params);
  return sortByPriceIfNeeded(reshapeProducts(products), sortKey, reverse);
}

function emptyCart(cartId: string): Cart {
  return reshapeCart({ id: cartId, currency_code: "usd", items: [] });
}

async function getCartById(cartId: string): Promise<Cart | undefined> {
  try {
    const { cart } = await medusa.store.cart.retrieve(cartId);
    return reshapeCart(cart);
  } catch {
    // 장바구니가 지워졌거나 다른 서버의 것이면 쿠키만 남는다. 화면은 빈 장바구니로 다룬다.
    return undefined;
  }
}

async function requireCartId(): Promise<string> {
  const cartId = (await cookies()).get("cartId")?.value;

  if (!cartId) {
    throw new Error("cartId cookie is missing");
  }

  return cartId;
}

export async function createCart(): Promise<Cart> {
  const regionId = await getRegionId();
  const { cart } = await medusa.store.cart.create(
    regionId ? { region_id: regionId } : {},
  );

  return reshapeCart(cart);
}

export async function addToCart(
  lines: { merchandiseId: string; quantity: number }[],
): Promise<Cart> {
  const cartId = await requireCartId();
  let cart: Cart | undefined;

  // Shopify 는 여러 줄을 한 번에 담는다. Medusa 는 줄 하나씩이라 순서대로 부른다.
  for (const line of lines) {
    const result = await medusa.store.cart.createLineItem(cartId, {
      variant_id: line.merchandiseId,
      quantity: line.quantity,
    });
    cart = reshapeCart(result.cart);
  }

  return cart ?? emptyCart(cartId);
}

export async function removeFromCart(lineIds: string[]): Promise<Cart> {
  const cartId = await requireCartId();

  for (const lineId of lineIds) {
    await medusa.store.cart.deleteLineItem(cartId, lineId);
  }

  // 삭제 응답의 본문 모양에 기대지 않고 장바구니를 다시 읽는다.
  const cart = await getCartById(cartId);
  return cart ?? emptyCart(cartId);
}

export async function updateCart(
  lines: { id: string; merchandiseId: string; quantity: number }[],
): Promise<Cart> {
  const cartId = await requireCartId();
  let cart: Cart | undefined;

  for (const line of lines) {
    const result = await medusa.store.cart.updateLineItem(cartId, line.id, {
      quantity: line.quantity,
    });
    cart = reshapeCart(result.cart);
  }

  return cart ?? emptyCart(cartId);
}

export async function getCart(): Promise<Cart | undefined> {
  "use cache: private";
  cacheTag(TAGS.cart);
  cacheLife("seconds");

  const cartId = (await cookies()).get("cartId")?.value;

  if (!cartId) {
    return undefined;
  }

  return getCartById(cartId);
}

async function cachedCollection(
  handle: string,
): Promise<Collection | undefined> {
  "use cache";
  cacheTag(TAGS.collections);
  cacheLife("days");

  const { product_categories } = await medusa.store.category.list({
    handle,
    limit: 1,
  });
  const category = product_categories[0];

  return category ? reshapeCollection(category) : undefined;
}

export async function getCollection(
  handle: string,
): Promise<Collection | undefined> {
  return whenReachable("getCollection", undefined, () =>
    cachedCollection(handle),
  );
}

type CollectionProductsInput = {
  collection: string;
  reverse?: boolean;
  sortKey?: string;
};

async function cachedCollectionProducts({
  collection,
  reverse,
  sortKey,
}: CollectionProductsInput): Promise<Product[]> {
  "use cache";
  cacheTag(TAGS.collections, TAGS.products);
  cacheLife("days");

  // 홈 화면의 두 컬렉션은 Shopify 쪽 관례다. Medusa 에는 없으므로 전체 상품으로 채운다.
  if (HOMEPAGE_COLLECTIONS.includes(collection)) {
    return listProducts({}, "CREATED_AT", true);
  }

  const { product_categories } = await medusa.store.category.list({
    handle: collection,
    limit: 1,
  });
  const category = product_categories[0];

  if (!category) {
    console.log(`No category found for \`${collection}\``);
    return [];
  }

  return listProducts({ category_id: category.id }, sortKey, reverse);
}

export async function getCollectionProducts(
  input: CollectionProductsInput,
): Promise<Product[]> {
  return whenReachable("getCollectionProducts", [], () =>
    cachedCollectionProducts(input),
  );
}

async function cachedCollections(): Promise<Collection[]> {
  "use cache";
  cacheTag(TAGS.collections);
  cacheLife("days");

  const { product_categories } = await medusa.store.category.list({
    limit: PRODUCT_PAGE_SIZE,
  });

  return [
    // 검색 화면의 "All" 은 카테고리가 아니라 /search 로 가는 첫 줄이다(Shopify 판과 같다).
    {
      handle: "",
      title: "All",
      description: "All products",
      seo: { title: "All", description: "All products" },
      path: "/search",
      updatedAt: new Date().toISOString(),
    },
    ...product_categories.map((category) => reshapeCollection(category)),
  ];
}

export async function getCollections(): Promise<Collection[]> {
  return whenReachable("getCollections", [], () => cachedCollections());
}

export async function getMenu(handle: string): Promise<Menu[]> {
  "use cache";
  cacheTag(TAGS.collections);
  cacheLife("days");

  // Shopify 의 메뉴는 CMS 자원이다. Medusa 에는 없으므로 스토어프런트가 상수로 소유한다.
  return MENUS[handle] ?? [];
}

export async function getPage(handle: string): Promise<Page | undefined> {
  "use cache";
  cacheTag(TAGS.collections);
  cacheLife("days");

  return PAGES.find((page) => page.handle === handle);
}

export async function getPages(): Promise<Page[]> {
  "use cache";
  cacheTag(TAGS.collections);
  cacheLife("days");

  return PAGES;
}

async function cachedProduct(handle: string): Promise<Product | undefined> {
  "use cache";
  cacheTag(TAGS.products);
  cacheLife("days");

  // Store API 의 단건 조회는 id 를 받는다. 화면은 handle 로 오므로 handle 필터가 붙은 목록으로 찾는다.
  const products = await listProducts({ handle, limit: 1 });

  return products[0];
}

export async function getProduct(handle: string): Promise<Product | undefined> {
  return whenReachable("getProduct", undefined, () => cachedProduct(handle));
}

async function cachedProductRecommendations(
  productId: string,
): Promise<Product[]> {
  "use cache";
  cacheTag(TAGS.products);
  cacheLife("days");

  // Medusa Store API 에는 추천 엔드포인트가 없다. 같은 스토어의 다른 상품을 최대 4개 보여 준다.
  const products = await listProducts({});

  return products.filter((product) => product.id !== productId).slice(0, 4);
}

export async function getProductRecommendations(
  productId: string,
): Promise<Product[]> {
  return whenReachable("getProductRecommendations", [], () =>
    cachedProductRecommendations(productId),
  );
}

type ProductsInput = {
  query?: string;
  reverse?: boolean;
  sortKey?: string;
};

async function cachedProducts({
  query,
  reverse,
  sortKey,
}: ProductsInput): Promise<Product[]> {
  "use cache";
  cacheTag(TAGS.products);
  cacheLife("days");

  return listProducts(query ? { q: query } : {}, sortKey, reverse);
}

export async function getProducts(input: ProductsInput): Promise<Product[]> {
  return whenReachable("getProducts", [], () => cachedProducts(input));
}

// app/api/revalidate/route.ts 가 부른다. Medusa 는 webhook 을 보내지 않으므로
// commerce-api 의 subscriber 나 운영자가 시크릿을 붙여 직접 호출하는 경로다.
export async function revalidate(req: NextRequest): Promise<NextResponse> {
  const secret = req.nextUrl.searchParams.get("secret");

  if (!secret || secret !== process.env.MEDUSA_REVALIDATION_SECRET) {
    console.error("Invalid revalidation secret.");
    return NextResponse.json({ status: 401 });
  }

  const tag = req.nextUrl.searchParams.get("tag") || "all";
  const isProductUpdate = tag === "all" || tag === TAGS.products;
  const isCollectionUpdate = tag === "all" || tag === TAGS.collections;

  if (!isProductUpdate && !isCollectionUpdate) {
    return NextResponse.json({ status: 200 });
  }

  if (isCollectionUpdate) {
    revalidateTag(TAGS.collections, "seconds");
  }

  if (isProductUpdate) {
    revalidateTag(TAGS.products, "seconds");
  }

  return NextResponse.json({ status: 200, revalidated: true, now: Date.now() });
}
