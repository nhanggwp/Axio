// Official IDs: https://geogebra.github.io/docs/reference/en/Toolbar/
export const toolGroups = [
  {
    title: "DI CHUYỂN",
    icon: "select",
    tools: [
      ["Chọn / Di chuyển", 0, "Kéo điểm tự do để thay đổi hình."],
      ["Di chuyển vùng vẽ", 40, "Kéo vùng trống để di chuyển góc nhìn."],
    ],
  },
  {
    title: "ĐIỂM",
    icon: "point",
    tools: [
      ["Điểm", 1, "Nhấp vào vùng vẽ để tạo điểm."],
      ["Điểm trên đối tượng", 501, "Chọn một đường hoặc đường tròn."],
      ["Giao điểm", 5, "Chọn hai đối tượng giao nhau."],
      ["Trung điểm", 19, "Chọn hai điểm hoặc một đoạn thẳng."],
    ],
  },
  {
    title: "ĐƯỜNG THẲNG",
    icon: "segment",
    tools: [
      ["Đoạn thẳng", 15, "Chọn hai đầu mút."],
      ["Đường thẳng", 2, "Chọn hai điểm."],
      ["Tia", 18, "Chọn gốc tia rồi điểm thứ hai."],
    ],
  },
  {
    title: "ĐA GIÁC",
    icon: "polygon",
    tools: [
      ["Đa giác", 16, "Chọn các đỉnh rồi chọn lại đỉnh đầu."],
      ["Đa giác đều", 51, "Chọn hai đỉnh rồi nhập số đỉnh."],
    ],
  },
  {
    title: "ĐƯỜNG TRÒN",
    icon: "circle",
    tools: [
      ["Tâm và một điểm", 10, "Chọn tâm rồi một điểm trên đường tròn."],
      ["Tâm và bán kính", 34, "Chọn tâm rồi nhập bán kính."],
      ["Qua ba điểm", 11, "Chọn ba điểm không thẳng hàng."],
    ],
  },
  {
    title: "DỰNG HÌNH",
    icon: "perpendicular",
    tools: [
      ["Đường vuông góc", 4, "Chọn một điểm rồi đường tham chiếu."],
      ["Đường song song", 3, "Chọn một điểm rồi đường tham chiếu."],
      ["Đường trung trực", 8, "Chọn đoạn thẳng hoặc hai điểm."],
      ["Đường phân giác", 9, "Chọn ba điểm; điểm giữa là đỉnh."],
    ],
  },
  {
    title: "ĐO LƯỜNG",
    icon: "angle",
    tools: [
      ["Góc", 36, "Chọn ba điểm; điểm giữa là đỉnh."],
      ["Khoảng cách / Độ dài", 38, "Chọn hai điểm hoặc một đoạn thẳng."],
      ["Diện tích", 49, "Chọn đa giác hoặc đường tròn."],
    ],
  },
  {
    title: "BIẾN HÌNH",
    icon: "transform",
    tools: [
      ["Đối xứng qua đường", 30, "Chọn đối tượng rồi trục đối xứng."],
      ["Đối xứng qua điểm", 29, "Chọn đối tượng rồi tâm đối xứng."],
      ["Tịnh tiến", 31, "Chọn đối tượng rồi vectơ."],
      ["Vectơ", 7, "Chọn hai điểm để tạo vectơ."],
      ["Quay", 32, "Chọn đối tượng, tâm rồi nhập góc."],
      ["Vị tự", 33, "Chọn đối tượng, tâm rồi nhập tỉ số."],
    ],
  },
  {
    title: "ĐỐI TƯỢNG",
    icon: "delete",
    tools: [
      [
        "Xóa đối tượng",
        6,
        "Chọn đối tượng cần xóa; đối tượng phụ thuộc cũng bị xóa.",
      ],
      ["Ẩn / Hiện", 27, "Chọn đối tượng rồi chuyển sang công cụ khác."],
    ],
  },
] as const;
