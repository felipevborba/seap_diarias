import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.sql.*;
import java.util.*;

/**
 * Extrator SOMENTE LEITURA do legado MySQL 5.1 (diarias_seres) via Connector/J 5.1.49.
 *
 *   java -cp ../../mysql-connector-java-5.1.49/mysql-connector-java-5.1.49.jar Extrator.java inventario
 *   java -cp ... Extrator.java exportar [tabela ...]
 *
 * inventario: ../schema/tabelas.tsv (tabela, linhas, engine, charset) e ../schema/<tabela>.sql (SHOW CREATE TABLE)
 * exportar:   ../dados/<tabela>.jsonl (uma linha JSON por registro; binários em base64 com prefixo "b64:")
 *             ../dados/<tabela>.colunas.tsv (nome, tipo JDBC, tipo MySQL, tamanho, nulo)
 * Credenciais em legado.properties (chmod 600), fora do código e da linha de comando.
 */
public class Extrator {
    // -Dbanco=<nome no MySQL> (ex.: "diarias?seres", que tem '?' literal no nome) e -Dsaida=<pasta em ../>
    static final String BANCO = System.getProperty("banco");
    static final Path BASE = Paths.get("..", System.getProperty("saida", ".")).toAbsolutePath().normalize();

    public static void main(String[] args) throws Exception {
        Properties p = new Properties();
        try (InputStream in = new FileInputStream("legado.properties")) { p.load(in); }
        Class.forName("com.mysql.jdbc.Driver");
        try (Connection c = DriverManager.getConnection(p.getProperty("url"), p.getProperty("user"), p.getProperty("password"))) {
            c.setReadOnly(true);
            c.setAutoCommit(false);
            if (BANCO != null) c.setCatalog(BANCO);
            try (ResultSet rs = c.createStatement().executeQuery("SELECT DATABASE()")) { rs.next(); System.out.println("Banco: " + rs.getString(1)); }
            String modo = args.length > 0 ? args[0] : "inventario";
            if (modo.equals("inventario")) inventario(c);
            else exportar(c, Arrays.asList(args).subList(1, args.length));
            c.rollback();
        }
    }

    static List<String> tabelas(Connection c) throws SQLException {
        List<String> t = new ArrayList<>();
        try (ResultSet rs = c.createStatement().executeQuery("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")) {
            while (rs.next()) t.add(rs.getString(1));
        }
        return t;
    }

    static void inventario(Connection c) throws Exception {
        Path dir = Files.createDirectories(BASE.resolve("schema"));
        try (Statement st = c.createStatement(); ResultSet v = st.executeQuery("SELECT VERSION(), @@character_set_database, @@collation_database")) {
            v.next();
            System.out.println("Servidor " + v.getString(1) + " | charset " + v.getString(2) + " / " + v.getString(3));
        }
        StringBuilder tsv = new StringBuilder("tabela\tlinhas\tengine\tcollation\n");
        Map<String, String[]> info = new HashMap<>();
        try (ResultSet rs = c.createStatement().executeQuery("SHOW TABLE STATUS")) {
            while (rs.next()) info.put(rs.getString("Name"), new String[]{rs.getString("Engine"), rs.getString("Collation")});
        }
        for (String t : tabelas(c)) {
            long n;
            try (ResultSet rs = c.createStatement().executeQuery("SELECT COUNT(*) FROM `" + t + "`")) { rs.next(); n = rs.getLong(1); }
            try (ResultSet rs = c.createStatement().executeQuery("SHOW CREATE TABLE `" + t + "`")) {
                rs.next();
                Files.writeString(dir.resolve(t + ".sql"), rs.getString(2) + ";\n", StandardCharsets.UTF_8);
            }
            String[] i = info.getOrDefault(t, new String[]{"", ""});
            tsv.append(t).append('\t').append(n).append('\t').append(i[0]).append('\t').append(i[1]).append('\n');
            System.out.printf("%-40s %10d%n", t, n);
        }
        // Views, procedures e triggers também contam regra de negócio.
        StringBuilder extras = new StringBuilder();
        for (String q : new String[]{"SHOW FULL TABLES WHERE Table_type = 'VIEW'", "SHOW PROCEDURE STATUS WHERE Db = DATABASE()",
                "SHOW FUNCTION STATUS WHERE Db = DATABASE()", "SHOW TRIGGERS"}) {
            extras.append("-- ").append(q).append('\n');
            try (ResultSet rs = c.createStatement().executeQuery(q)) {
                while (rs.next()) extras.append(rs.getString(1)).append('\n');
            } catch (SQLException e) { extras.append("(erro: ").append(e.getMessage()).append(")\n"); }
        }
        Files.writeString(dir.resolve("_objetos.txt"), extras.toString(), StandardCharsets.UTF_8);
        Files.writeString(dir.resolve("tabelas.tsv"), tsv.toString(), StandardCharsets.UTF_8);
        System.out.println("Inventário em " + dir);
    }

    static void exportar(Connection c, List<String> filtro) throws Exception {
        Path dir = Files.createDirectories(BASE.resolve("dados"));
        for (String t : tabelas(c)) {
            if (!filtro.isEmpty() && !filtro.contains(t)) continue;
            long n = 0;
            try (Statement st = c.createStatement(ResultSet.TYPE_FORWARD_ONLY, ResultSet.CONCUR_READ_ONLY)) {
                st.setFetchSize(Integer.MIN_VALUE); // streaming no Connector/J (não carrega a tabela em memória)
                try (ResultSet rs = st.executeQuery("SELECT * FROM `" + t + "`");
                     Writer w = Files.newBufferedWriter(dir.resolve(t + ".jsonl"), StandardCharsets.UTF_8)) {
                    ResultSetMetaData md = rs.getMetaData();
                    int cols = md.getColumnCount();
                    StringBuilder meta = new StringBuilder("coluna\tjdbc\tmysql\ttamanho\tnulo\n");
                    for (int i = 1; i <= cols; i++)
                        meta.append(md.getColumnName(i)).append('\t').append(md.getColumnType(i)).append('\t')
                            .append(md.getColumnTypeName(i)).append('\t').append(md.getPrecision(i)).append('\t')
                            .append(md.isNullable(i) == ResultSetMetaData.columnNullable).append('\n');
                    Files.writeString(dir.resolve(t + ".colunas.tsv"), meta.toString(), StandardCharsets.UTF_8);
                    while (rs.next()) {
                        StringBuilder sb = new StringBuilder("{");
                        for (int i = 1; i <= cols; i++) {
                            if (i > 1) sb.append(',');
                            json(sb, md.getColumnLabel(i));
                            sb.append(':');
                            int tipo = md.getColumnType(i);
                            if (tipo == Types.BLOB || tipo == Types.LONGVARBINARY || tipo == Types.VARBINARY || tipo == Types.BINARY) {
                                byte[] b = rs.getBytes(i);
                                if (b == null) sb.append("null"); else json(sb, "b64:" + Base64.getEncoder().encodeToString(b));
                            } else {
                                String v = rs.getString(i);
                                if (v == null) sb.append("null"); else json(sb, v);
                            }
                        }
                        w.write(sb.append("}\n").toString());
                        n++;
                    }
                }
            }
            System.out.printf("%-40s %10d registros%n", t, n);
        }
    }

    static void json(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (ch < 0x20) sb.append(String.format("\\u%04x", (int) ch)); else sb.append(ch);
            }
        }
        sb.append('"');
    }
}
