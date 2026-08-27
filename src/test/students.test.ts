import { describe, expect, it } from "vitest";
import { studentIdFor, studentNameFromFile } from "@/lib/students";

describe("studentNameFromFile", () => {
  it("reads a real name out of a typical upload", () => {
    expect(studentNameFromFile("aryan_sharma_answer_sheet.pdf", 0)).toBe("Aryan Sharma");
    expect(studentNameFromFile("Meera-Patel-answers.pdf", 1)).toBe("Meera Patel");
    expect(studentNameFromFile("rohit kumar.jpg", 2)).toBe("Rohit Kumar");
  });

  it("strips the words that describe the file rather than the student", () => {
    expect(studentNameFromFile("Priya_Answer_Sheet_Scan_Copy.pdf", 0)).toBe("Priya");
    expect(studentNameFromFile("sana-final-submission-page.png", 0)).toBe("Sana");
  });

  it("turns a bare number into a position, not a name", () => {
    expect(studentNameFromFile("student_1_answer_sheet.pdf", 0)).toBe("Student 1");
    expect(studentNameFromFile("12.pdf", 4)).toBe("Student 12");
  });

  it("falls back to the batch position when nothing identifying survives", () => {
    expect(studentNameFromFile("answer_sheet.pdf", 0)).toBe("Student 1");
    expect(studentNameFromFile("scan.png", 6)).toBe("Student 7");
    expect(studentNameFromFile(".pdf", 2)).toBe("Student 3");
  });

  it("drops the noise a camera or export tool adds", () => {
    // The digit run is a camera timestamp, not part of the student's name.
    expect(studentNameFromFile("IMG_20240115_ravi.jpg", 0)).toBe("Ravi");
    expect(studentNameFromFile("a3f9c2b8e1d4_neha.pdf", 0)).toBe("Neha");
    expect(studentNameFromFile("2024-01-15_arjun.pdf", 0)).toBe("Arjun");
  });

  it("keeps a long name usable rather than letting it break the layout", () => {
    const name = studentNameFromFile(`${"verylongname".repeat(6)}.pdf`, 0);
    expect(name.length).toBeLessThanOrEqual(48);
    expect(name.endsWith("…")).toBe(true);
  });

  it("gives every position a distinct id", () => {
    expect(studentIdFor(0)).toBe("s_1");
    expect(studentIdFor(9)).toBe("s_10");
    expect(new Set([0, 1, 2].map(studentIdFor)).size).toBe(3);
  });
});
