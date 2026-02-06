import {
  getPositionIndex,
  getRankIndex,
  sortUsersByPositionRankAndName,
  JABATAN_ORDER,
  PANGKAT_ORDER,
} from "../src/utils/sortingHelper.js";

describe("sortingHelper", () => {
  describe("getPositionIndex", () => {
    it("should return correct index for DIR position", () => {
      expect(getPositionIndex("DIR BINMAS")).toBe(0);
      expect(getPositionIndex("DIREKTUR")).toBe(0);
    });

    it("should return correct index for WADIR position", () => {
      expect(getPositionIndex("WADIR BINMAS")).toBe(1);
    });

    it("should return correct index for KASUBDIT position", () => {
      expect(getPositionIndex("KASUBDIT PEMBINAAN")).toBe(2);
    });

    it("should return correct index for KASAT position", () => {
      expect(getPositionIndex("KASAT BINMAS")).toBe(5);
    });

    it("should return Infinity for unknown positions", () => {
      expect(getPositionIndex("UNKNOWN")).toBe(Infinity);
      expect(getPositionIndex("")).toBe(Infinity);
      expect(getPositionIndex(null)).toBe(Infinity);
    });

    it("should be case insensitive", () => {
      expect(getPositionIndex("kasat binmas")).toBe(5);
      expect(getPositionIndex("KASAT BINMAS")).toBe(5);
    });
  });

  describe("getRankIndex", () => {
    it("should return correct index for KBP rank", () => {
      expect(getRankIndex("KBP")).toBe(0);
      expect(getRankIndex("KOMISARIS BESAR POLISI")).toBe(1);
    });

    it("should return correct index for AKBP rank", () => {
      expect(getRankIndex("AKBP")).toBe(2);
    });

    it("should return correct index for AKP rank", () => {
      expect(getRankIndex("AKP")).toBe(4);
    });

    it("should return correct index for IPTU rank", () => {
      expect(getRankIndex("IPTU")).toBe(5);
    });

    it("should return correct index for civilian ranks", () => {
      expect(getRankIndex("PEMBINA UTAMA")).toBe(15);
      expect(getRankIndex("PENATA")).toBe(23);
      expect(getRankIndex("PENGATUR")).toBe(25);
      expect(getRankIndex("JURU")).toBe(31);
    });

    it("should return correct index for contract employees", () => {
      expect(getRankIndex("PPPK")).toBe(32);
      expect(getRankIndex("PHL")).toBe(33);
    });

    it("should return Infinity for unknown ranks", () => {
      expect(getRankIndex("UNKNOWN")).toBe(Infinity);
      expect(getRankIndex("")).toBe(Infinity);
      expect(getRankIndex(null)).toBe(Infinity);
    });

    it("should be case insensitive", () => {
      expect(getRankIndex("akbp")).toBe(2);
      expect(getRankIndex("AKBP")).toBe(2);
    });
  });

  describe("sortUsersByPositionRankAndName", () => {
    it("should sort by position first", () => {
      const users = [
        { jabatan: "KASAT BINMAS", title: "IPTU", nama: "Alice" },
        { jabatan: "DIR BINMAS", title: "AKBP", nama: "Bob" },
        { jabatan: "WADIR BINMAS", title: "KOMPOL", nama: "Charlie" },
      ];

      const sorted = sortUsersByPositionRankAndName(users);

      expect(sorted[0].nama).toBe("Bob"); // DIR first
      expect(sorted[1].nama).toBe("Charlie"); // WADIR second
      expect(sorted[2].nama).toBe("Alice"); // KASAT third
    });

    it("should sort by rank when positions are the same", () => {
      const users = [
        { jabatan: "KASAT BINMAS A", title: "IPTU", nama: "Alice" },
        { jabatan: "KASAT BINMAS B", title: "AKBP", nama: "Bob" },
        { jabatan: "KASAT BINMAS C", title: "AKP", nama: "Charlie" },
      ];

      const sorted = sortUsersByPositionRankAndName(users);

      expect(sorted[0].nama).toBe("Bob"); // AKBP first
      expect(sorted[1].nama).toBe("Charlie"); // AKP second
      expect(sorted[2].nama).toBe("Alice"); // IPTU third
    });

    it("should sort by name when position and rank are the same", () => {
      const users = [
        { jabatan: "KASAT BINMAS", title: "IPTU", nama: "Charlie" },
        { jabatan: "KASAT BINMAS", title: "IPTU", nama: "Alice" },
        { jabatan: "KASAT BINMAS", title: "IPTU", nama: "Bob" },
      ];

      const sorted = sortUsersByPositionRankAndName(users);

      expect(sorted[0].nama).toBe("Alice");
      expect(sorted[1].nama).toBe("Bob");
      expect(sorted[2].nama).toBe("Charlie");
    });

    it("should handle complex multi-level sorting", () => {
      const users = [
        { jabatan: "STAFF", title: "BRIGADIR", nama: "User5" },
        { jabatan: "KASAT BINMAS", title: "IPTU", nama: "User3" },
        { jabatan: "DIR BINMAS", title: "AKBP", nama: "User1" },
        { jabatan: "KASAT LANTAS", title: "AKP", nama: "User4" },
        { jabatan: "WADIR BINMAS", title: "KOMPOL", nama: "User2" },
      ];

      const sorted = sortUsersByPositionRankAndName(users);

      expect(sorted[0].nama).toBe("User1"); // DIR + AKBP
      expect(sorted[1].nama).toBe("User2"); // WADIR + KOMPOL
      expect(sorted[2].nama).toBe("User4"); // KASAT + AKP
      expect(sorted[3].nama).toBe("User3"); // KASAT + IPTU
      expect(sorted[4].nama).toBe("User5"); // No position + BRIGADIR
    });

    it("should handle users without position or rank", () => {
      const users = [
        { jabatan: null, title: null, nama: "User3" },
        { jabatan: "KASAT BINMAS", title: "IPTU", nama: "User1" },
        { jabatan: "STAFF", title: null, nama: "User2" },
      ];

      const sorted = sortUsersByPositionRankAndName(users);

      expect(sorted[0].nama).toBe("User1"); // Has position and rank
      // User2 and User3 have the same sort keys (Infinity position, Infinity rank, same priority)
      // JavaScript's Array.sort is stable, so original order is preserved: User3 before User2
      expect(sorted[1].nama).toBe("User3");
      expect(sorted[2].nama).toBe("User2");
    });

    it("should not mutate original array", () => {
      const users = [
        { jabatan: "KASAT", title: "IPTU", nama: "B" },
        { jabatan: "DIR", title: "AKBP", nama: "A" },
      ];
      const original = [...users];

      sortUsersByPositionRankAndName(users);

      expect(users).toEqual(original);
    });
  });

  describe("JABATAN_ORDER constant", () => {
    it("should have correct order", () => {
      expect(JABATAN_ORDER).toEqual([
        "DIR",
        "WADIR",
        "KASUBDIT",
        "KABAG",
        "KASUBBAG",
        "KASAT",
        "KANIT",
      ]);
    });
  });

  describe("PANGKAT_ORDER constant", () => {
    it("should start with police ranks", () => {
      expect(PANGKAT_ORDER.slice(0, 5)).toEqual([
        "KBP",
        "KOMISARIS BESAR POLISI",
        "AKBP",
        "KOMPOL",
        "AKP",
      ]);
    });

    it("should end with contract employees", () => {
      const lastTwo = PANGKAT_ORDER.slice(-2);
      expect(lastTwo).toEqual(["PPPK", "PHL"]);
    });
  });
});
