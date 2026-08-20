import { describe, expect, test } from "bun:test";
import { slugify, stripDiacritics } from "../common/utils/slug.js";
import { parseMetaFromCode } from "../modules/tools/common/code-annotations.js";

describe("slugify", () => {
  test("strips Vietnamese diacritics instead of dropping letters", () => {
    expect(slugify("Công cụ tin tức")).toBe("cong-cu-tin-tuc");
    expect(slugify("Đặng Thị Ước")).toBe("dang-thi-uoc");
    expect(slugify("Hồ Chí Minh")).toBe("ho-chi-minh");
  });

  test("maps đ/Đ and remaining Latin letters", () => {
    expect(stripDiacritics("Đà Nẵng")).toBe("Da Nang");
    expect(slugify("Café résumé")).toBe("cafe-resume");
  });

  test("supports snake_case separator for tool names", () => {
    expect(slugify("Công cụ tìm kiếm", "_")).toBe("cong_cu_tim_kiem");
  });

  test("handles NFD combining marks", () => {
    const nfd = "Công cụ".normalize("NFD");
    expect(slugify(nfd)).toBe("cong-cu");
  });
});

describe("parseMetaFromCode", () => {
  test("derives snake_case tool name from Vietnamese @name", () => {
    const meta = parseMetaFromCode("# @name Công cụ tìm kiếm\n# @description Search\nreturn {}");
    expect(meta.label).toBe("Công cụ tìm kiếm");
    expect(meta.name).toBe("cong_cu_tim_kiem");
  });
});
